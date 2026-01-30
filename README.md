# Telegram Bot

### 1. Клонування та встановлення

```bash
git clone <repo-url>
cd bot-telegram
npm install
```

### 2. Налаштування токена

1. Створіть бота через [@BotFather](https://t.me/BotFather) і отримайте токен
2. Скопіюйте `.env.example` у `.env`:

```bash
cp .env.example .env
```

3. Вставте токен у `.env`:

```
TELEGRAM_BOT_TOKEN=your_token_here
```

### 3. Redis

```bash
docker compose up -d redis
```

Або локально: додайте `REDIS_URL=redis://localhost:6379` в `.env`. Якщо Redis недоступний, бот працює без дедуплікації.

### 4. PostgreSQL

**Варіант A — Docker :**

```bash
docker compose up -d postgres
```

**Варіант B — локальний PostgreSQL:**

Створіть базу даних і оновіть `DATABASE_URL` в `.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/bot_telegram?schema=public
```

### 5. Міграції Prisma

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 6. Запуск

```bash
npm run start:dev
```

## Запуск через Docker Compose

```bash
# Вкажіть токен бота
export TELEGRAM_BOT_TOKEN=your_token_here

# Запуск
docker compose up --build
```

Це підніме PostgreSQL + Redis + додаток, застосує міграції автоматично.
