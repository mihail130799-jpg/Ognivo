import { Api } from 'grammy';
import { env } from './env.js';

/**
 * Клиент Bot API для отправки сообщений из API-маршрутов (выгрузка, обратная связь, напоминания).
 * Не зависит от того, запущен ли приём обновлений ботом.
 */
export const telegram: Api | null = env.BOT_TOKEN ? new Api(env.BOT_TOKEN) : null;
