import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service.js';

@Module({
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
