import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User, Chat } from '@prisma/client';
import type { TelegramUserDto } from './dto/telegram-user.dto.js';
import type { TelegramChatDto } from './dto/telegram-chat.dto.js';
import type { SaveEventDto } from './dto/save-event.dto.js';
import type { UserSummaryDto } from './dto/user-summary.dto.js';

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(dto: TelegramUserDto): Promise<User> {
    return this.prisma.user.upsert({
      where: { telegramId: BigInt(dto.id) },
      update: {
        firstName: dto.first_name,
        lastName: dto.last_name ?? null,
        username: dto.username ?? null,
        languageCode: dto.language_code ?? null,
        isPremium: dto.is_premium ?? false,
      },
      create: {
        telegramId: BigInt(dto.id),
        isBot: dto.is_bot ?? false,
        firstName: dto.first_name,
        lastName: dto.last_name ?? null,
        username: dto.username ?? null,
        languageCode: dto.language_code ?? null,
        isPremium: dto.is_premium ?? false,
      },
    });
  }

  async upsertChat(dto: TelegramChatDto): Promise<Chat> {
    return this.prisma.chat.upsert({
      where: { telegramId: BigInt(dto.id) },
      update: {
        type: dto.type,
        title: dto.title ?? null,
        username: dto.username ?? null,
        firstName: dto.first_name ?? null,
        lastName: dto.last_name ?? null,
      },
      create: {
        telegramId: BigInt(dto.id),
        type: dto.type,
        title: dto.title ?? null,
        username: dto.username ?? null,
        firstName: dto.first_name ?? null,
        lastName: dto.last_name ?? null,
      },
    });
  }

  async saveEvent(dto: SaveEventDto) {
    const event = await this.prisma.event.create({
      data: {
        updateId: BigInt(dto.updateId),
        type: dto.type,
        text: dto.text,
        rawPayload: dto.rawPayload,
        userId: dto.userId,
        chatId: dto.chatId,
      },
    });

    this.logger.log(
      `Saved event #${event.id} type="${dto.type}" updateId=${dto.updateId}`,
    );
    return event;
  }

  /**
   * Отримує зведену інформацію для команди /me:
   * - дані профілю користувача
   * - дані чату
   * - кількість подій від користувача
   * - кількість повідомлень з текстом
   * - дата першої та останньої активності
   */
  async getUserSummary(
    telegramUserId: number,
    telegramChatId: number,
  ): Promise<UserSummaryDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
    });

    const chat = await this.prisma.chat.findUnique({
      where: { telegramId: BigInt(telegramChatId) },
    });

    if (!user) return null;

    // Загальна кількість подій від цього користувача
    const totalEvents = await this.prisma.event.count({
      where: { userId: user.id },
    });

    // Кількість текстових повідомлень
    const textMessages = await this.prisma.event.count({
      where: {
        userId: user.id,
        type: 'message',
        text: { not: null },
      },
    });

    // Розподіл подій за типами — корисна метрика
    const eventsByType = await this.prisma.event.groupBy({
      by: ['type'],
      where: { userId: user.id },
      _count: { id: true },
    });

    const firstEvent = await this.prisma.event.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const lastEvent = await this.prisma.event.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      user,
      chat,
      totalEvents,
      textMessages,
      eventsByType: eventsByType.map((e) => ({
        type: e.type,
        count: e._count.id,
      })),
      firstActivity: firstEvent?.createdAt ?? null,
      lastActivity: lastEvent?.createdAt ?? null,
    };
  }
}
