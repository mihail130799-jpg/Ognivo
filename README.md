# Ognivo

Трекер дел, денег и тренировок в виде Telegram Mini App.

## Структура

| Папка | Что внутри |
|---|---|
| `app/` | Mini App: React + TypeScript + Vite |
| `server/` | API (Fastify), Telegram-бот (grammY), база (Prisma) |
| `shared/` | Общие типы и справочники (категории и т.п.) |
| `design/` | Макеты дизайна |

## Запуск для разработки

1. Скопировать `server/.env.example` в `server/.env` и заполнить.
2. Установить зависимости и подготовить базу:

```bash
npm install
npm run db:push -w server
```

3. Запустить приложение и сервер:

```bash
npm run dev
```

Mini App: http://localhost:5173, API: http://localhost:3000/api/health.

Для локальной разработки без Telegram в `server/.env` можно включить `DEV_AUTH_BYPASS=true`
(работает только при `NODE_ENV=development`).
