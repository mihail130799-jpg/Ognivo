import { Bot, InlineKeyboard } from 'grammy';
import { env } from './env.js';

/** Создаёт бота, если задан BOT_TOKEN. Напоминания и обратная связь — на этапе 5. */
export function createBot(): Bot | null {
  if (!env.BOT_TOKEN) {
    console.warn('BOT_TOKEN не задан — бот не запущен.');
    return null;
  }

  const bot = new Bot(env.BOT_TOKEN);

  bot.command('start', async (ctx) => {
    const text =
      'Привет! Я Ognivo — трекер дел, денег и тренировок.\n' +
      'Нажмите кнопку ниже, чтобы открыть приложение.';
    if (!env.WEBAPP_URL) return ctx.reply(text);
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard().webApp('🔥 Открыть Ognivo', env.WEBAPP_URL),
    });
  });

  bot.catch((err) => console.error('Ошибка бота:', err.error));
  return bot;
}
