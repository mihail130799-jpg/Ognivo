import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Не PORT: эту переменную часто подставляют хостинг и инструменты запуска для фронтенда.
  API_PORT: z.coerce.number().int().positive().default(3000),
  BOT_TOKEN: z.string().default(''),
  WEBAPP_URL: z.string().default(''),
  FEEDBACK_CHAT_ID: z.string().default(''),
  /** Папка собранного Mini App; сервер отдаёт его по тому же адресу, что и API */
  STATIC_DIR: z.string().default('../app/dist'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL не задан'),
  DEV_AUTH_BYPASS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Ошибка в переменных окружения (server/.env):', parsed.error.issues);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Обход проверки подписи возможен только в режиме разработки — никогда в production.
  DEV_AUTH_BYPASS: parsed.data.NODE_ENV === 'development' && parsed.data.DEV_AUTH_BYPASS,
};
