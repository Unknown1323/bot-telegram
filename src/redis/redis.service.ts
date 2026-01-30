import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;
  private connected = false;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    this.client = createClient({ url });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });

    void this.client.connect().then(() => {
      this.connected = true;
      this.logger.log('Redis connected');
    });
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.client.quit();
    }
  }

  /**
   * Механізм: SET NX з TTL 60 секунд.
   * Якщо ключ вже існує — значить update вже був оброблений.
   */
  async isDuplicate(updateId: number): Promise<boolean> {
    if (!this.connected) return false;

    const key = `tg:update:${updateId}`;
    // SET NX повертає null, якщо ключ вже існує
    const result = await this.client.set(key, '1', { NX: true, EX: 60 });
    return result === null;
  }
}
