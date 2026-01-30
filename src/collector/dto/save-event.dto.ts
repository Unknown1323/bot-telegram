import type { Prisma } from '@prisma/client';

export class SaveEventDto {
  updateId: number;
  type: string;
  rawPayload: Prisma.InputJsonValue;
  text: string | null;
  userId: number | null;
  chatId: number | null;
}
