import { Module } from '@nestjs/common';
import { CollectorModule } from '../collector/collector.module.js';
import { TelegramService } from './telegram.service.js';

@Module({
  imports: [CollectorModule],
  providers: [TelegramService],
})
export class TelegramModule {}
