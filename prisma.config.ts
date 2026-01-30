import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Завантажуємо .env з кореня проєкту
config();

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
