# Ognivo

Трекер дел, денег и тренировок: Telegram Mini App и Android-приложение с общим аккаунтом.

- **План** — задачи, события с повторами и напоминаниями, привычки
- **Деньги** — доходы и расходы по категориям, копилки с целями (отдельная валюта для копилок)
- **Спорт** — тренировки, упражнения, подходы, план на неделю
- Напоминания приходят сообщением от бота в Telegram

## Как пользоваться

- **В Telegram** — откройте бота [@ognivo_tracker_bot](https://t.me/ognivo_tracker_bot) и нажмите «Ognivo».
- **На Android** — скачайте `.apk` из раздела [Releases](../../releases/latest) и установите
  (телефон попросит разрешить установку из этого источника). Нажмите «Войти через Telegram»,
  подтвердите вход в боте — откроются те же записи, что и в Telegram.

## Устройство

| Папка | Что внутри |
|---|---|
| `app/` | Интерфейс: React + TypeScript + Vite |
| `app/android/` | Android-приложение (Capacitor) — тот же интерфейс внутри APK |
| `server/` | API (Fastify), Telegram-бот (grammY), база SQLite (Prisma) |
| `shared/` | Общие типы и справочники (категории, упражнения) |
| `deploy/` | Docker Compose и пример конфигурации Caddy для сервера |
| `design/` | Макет дизайна |

**Вход.** В Telegram сервер проверяет подпись `initData`. Вне Telegram приложение создаёт
запрос входа, пользователь подтверждает его в боте (с кодом из приложения), и приложение
получает токен сессии; в базе хранится только его хеш.

## Разработка

1. Скопировать `server/.env.example` в `server/.env` и заполнить
   (для работы без Telegram — `DEV_AUTH_BYPASS=true`, действует только при `NODE_ENV=development`).
2. Установить зависимости и подготовить базу:

```bash
npm install
npm run db:push -w server
```

3. Запустить интерфейс и сервер:

```bash
npm run dev
```

Интерфейс: http://localhost:5173, API: http://localhost:3000/api/health. Тесты: `npm test`.

### Android

Нужны JDK 21+ и Android SDK. Адрес сервера для приложения — в `app/.env.android`.

```bash
npm run build:android -w app
cd app/android && ./gradlew assembleDebug
```

Подписанный APK собирает GitHub Actions по тегу `v*` (секреты `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) и прикладывает его к релизу.

### Сервер

Docker-образ собирается из `Dockerfile`; база — в томе `/data`, резервные копии —
`node server/scripts/backup.mjs` (снимок через `VACUUM INTO`, хранение 14 дней).

## Лицензия

[MIT](LICENSE)
