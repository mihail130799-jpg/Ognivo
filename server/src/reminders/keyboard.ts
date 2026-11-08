import { InlineKeyboard } from 'grammy';
import { env } from '../env.js';

/** Есть ли HTTPS-адрес Mini App — без него кнопку открытия показать нельзя. */
export const hasWebApp = () => env.WEBAPP_URL.startsWith('https://');

/** Клавиатура с одной кнопкой «Открыть Ognivo» или undefined, если адреса приложения ещё нет. */
export function openAppKeyboard(text = '🔥 Открыть Ognivo'): InlineKeyboard | undefined {
  return hasWebApp() ? new InlineKeyboard().webApp(text, env.WEBAPP_URL) : undefined;
}

/** Клавиатура напоминания: «Готово» для задач + открыть приложение. */
export function reminderKeyboard(done?: { taskId: string; date: string }): InlineKeyboard | undefined {
  const kb = new InlineKeyboard();
  if (done) kb.text('✅ Готово', `done:${done.taskId}:${done.date}`);
  if (hasWebApp()) kb.webApp('Открыть', env.WEBAPP_URL);
  return kb.inline_keyboard.flat().length ? kb : undefined;
}
