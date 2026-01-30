import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import type { Update } from 'telegraf/types';
import { CollectorService } from '../collector/collector.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { TelegramChatDto } from '../collector/dto/telegram-chat.dto.js';
import type { SaveEventDto } from '../collector/dto/save-event.dto.js';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;

  constructor(
    private readonly config: ConfigService,
    private readonly collector: CollectorService,
    private readonly redis: RedisService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment');
    }
    this.bot = new Telegraf(token);
  }

  onModuleInit() {
    this.registerHandlers();
    void this.bot.launch().then(() => {
      this.logger.log('Telegram bot started (long-polling)');
    });
  }

  onModuleDestroy() {
    this.bot.stop('NestJS shutdown');
    this.logger.log('Telegram bot stopped');
  }

  private registerHandlers() {
    this.bot.start((ctx) => this.handleStart(ctx));

    this.bot.command('me', (ctx) => this.handleMe(ctx));

    this.bot.use((ctx, next) => this.handleAnyUpdate(ctx, next));
  }

  /**
   * /start — привітання та коротка інструкція.
   */
  private async handleStart(ctx: Context) {
    await this.processUpdate(ctx);

    const name = ctx.from?.first_name ?? 'користувачу';
    await ctx.reply(
      `Привіт, ${name}! 👋\n\n` +
        `Я — бот-колектор. Я зберігаю інформацію з кожного повідомлення та події у цьому чаті.\n\n` +
        `Доступні команди:\n` +
        `/start — ця інструкція\n` +
        `/me — подивитися, що я знаю про тебе\n\n` +
        `Просто пиши будь-що — я все збережу!`,
    );
  }

  /**
   * /me — повертає зведену інформацію про користувача з БД.
   */
  private async handleMe(ctx: Context) {
    await this.processUpdate(ctx);

    if (!ctx.from || !ctx.chat) {
      await ctx.reply('Не вдалося визначити користувача або чат.');
      return;
    }

    const summary = await this.collector.getUserSummary(
      ctx.from.id,
      ctx.chat.id,
    );

    if (!summary) {
      await ctx.reply('Поки що я не маю даних про тебе. Спробуй пізніше!');
      return;
    }

    const {
      user,
      chat,
      totalEvents,
      textMessages,
      eventsByType,
      firstActivity,
      lastActivity,
    } = summary;

    // Формуємо читабельне резюме
    const lines: string[] = [
      `📊 *Інформація про тебе*\n`,
      `*Профіль:*`,
      `• Telegram ID: \`${user.telegramId}\``,
      `• Ім'я: ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`,
    ];

    if (user.username) lines.push(`• Username: @${user.username}`);
    if (user.languageCode) lines.push(`• Мова: ${user.languageCode}`);
    if (user.isPremium) lines.push(`• Premium: ✅`);

    if (chat) {
      lines.push(`\n*Чат:*`);
      lines.push(`• Тип: ${chat.type}`);
      if (chat.title) lines.push(`• Назва: ${chat.title}`);
    }

    // Метрики
    lines.push(`\n*Метрики:*`);
    lines.push(`• Всього подій: ${totalEvents}`);
    lines.push(`• Текстових повідомлень: ${textMessages}`);

    if (eventsByType.length > 0) {
      lines.push(`\n*Розподіл за типами:*`);
      for (const entry of eventsByType) {
        lines.push(`• ${entry.type}: ${entry.count}`);
      }
    }

    if (firstActivity) {
      lines.push(`\n• Перша активність: ${firstActivity.toISOString()}`);
    }
    if (lastActivity) {
      lines.push(`• Остання активність: ${lastActivity.toISOString()}`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  }

  /**
   * Middleware для перехоплення всіх update, які НЕ оброблені командами.
   */
  private async handleAnyUpdate(ctx: Context, next: () => Promise<void>) {
    await this.processUpdate(ctx);
    return next();
  }

  /**
   * Основна логіка обробки update:
   * 1. Upsert користувача (якщо є from)
   * 2. Upsert чату (якщо є chat)
   * 3. Збереження повного update як події через SaveEventDto
   */
  private async processUpdate(ctx: Context) {
    try {
      const update = ctx.update;

      // Дедуплікація: якщо update вже оброблений — пропускаємо
      if (await this.redis.isDuplicate(update.update_id)) {
        this.logger.debug(`Duplicate update ${update.update_id}, skipping`);
        return;
      }

      let dbUserId: number | null = null;
      let dbChatId: number | null = null;

      // Upsert користувача, якщо дані доступні
      if (ctx.from) {
        const user = await this.collector.upsertUser(ctx.from);
        dbUserId = user.id;
      }

      // Upsert чату — мапимо ctx.chat на TelegramChatDto
      if (ctx.chat) {
        const chatDto: TelegramChatDto = {
          id: ctx.chat.id,
          type: ctx.chat.type,
          title: 'title' in ctx.chat ? ctx.chat.title : undefined,
          username: 'username' in ctx.chat ? ctx.chat.username : undefined,
          first_name:
            'first_name' in ctx.chat ? ctx.chat.first_name : undefined,
          last_name: 'last_name' in ctx.chat ? ctx.chat.last_name : undefined,
        };
        const chat = await this.collector.upsertChat(chatDto);
        dbChatId = chat.id;
      }

      // Формуємо SaveEventDto
      const eventDto: SaveEventDto = {
        updateId: update.update_id,
        type: this.detectUpdateType(update),
        rawPayload: update as unknown as SaveEventDto['rawPayload'],
        text: this.extractText(update),
        userId: dbUserId,
        chatId: dbChatId,
      };

      await this.collector.saveEvent(eventDto);
    } catch (error) {
      this.logger.error('Failed to process update', (error as Error).stack);
    }
  }

  /**
   * Визначає тип update на основі присутніх полів.
   * Telegram надсилає рівно одне з цих полів у кожному update.
   */
  private detectUpdateType(update: Update): string {
    if ('message' in update) return 'message';
    if ('edited_message' in update) return 'edited_message';
    if ('channel_post' in update) return 'channel_post';
    if ('edited_channel_post' in update) return 'edited_channel_post';
    if ('callback_query' in update) return 'callback_query';
    if ('inline_query' in update) return 'inline_query';
    if ('chosen_inline_result' in update) return 'chosen_inline_result';
    if ('shipping_query' in update) return 'shipping_query';
    if ('pre_checkout_query' in update) return 'pre_checkout_query';
    if ('poll' in update) return 'poll';
    if ('poll_answer' in update) return 'poll_answer';
    if ('my_chat_member' in update) return 'my_chat_member';
    if ('chat_member' in update) return 'chat_member';
    if ('chat_join_request' in update) return 'chat_join_request';
    return 'unknown';
  }

  /**
   * Витягує текст з update (підтримує message, edited_message, callback_query).
   */
  private extractText(update: Update): string | null {
    if ('message' in update && update.message && 'text' in update.message) {
      return update.message.text ?? null;
    }
    if (
      'edited_message' in update &&
      update.edited_message &&
      'text' in update.edited_message
    ) {
      return update.edited_message.text ?? null;
    }
    if (
      'callback_query' in update &&
      update.callback_query &&
      'data' in update.callback_query
    ) {
      return update.callback_query.data ?? null;
    }
    return null;
  }
}
