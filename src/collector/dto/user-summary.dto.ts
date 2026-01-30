import type { User, Chat } from '@prisma/client';

export class EventsByTypeDto {
  type: string;
  count: number;
}

export class UserSummaryDto {
  user: User;
  chat: Chat | null;
  totalEvents: number;
  textMessages: number;
  eventsByType: EventsByTypeDto[];
  firstActivity: Date | null;
  lastActivity: Date | null;
}
