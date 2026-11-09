import { Bot, InlineKeyboard } from 'grammy';
import { occursOn, type Repeat } from '@ognivo/shared';
import { env } from './env.js';
import { prisma } from './db.js';
import { hasWebApp, openAppKeyboard } from './reminders/keyboard.js';
import { escapeHtml } from './reminders/plan.js';
import { cancelLoginRequest, confirmLoginRequest, findLoginRequest, LOGIN_PREFIX } from './auth/appLogin.js';

const HELP =
  'Ognivo — трекер дел, денег и тренировок.\n\n' +
  '• Задачи, события и привычки — раздел «План»\n' +
  '• Доходы, расходы и копилки — «Деньги»\n' +
  '• Тренировки и упражнения — «Спорт»\n\n' +
  'Напоминания включаются в приложении: Настройки → Уведомления.\n' +
  'Вопрос или идея? Настройки → Обратная связь — ответим здесь, в чате.';

/** Создаёт бота, если задан BOT_TOKEN. */
export function createBot(): Bot | null {
  if (!env.BOT_TOKEN) {
    console.warn('BOT_TOKEN не задан — бот не запущен.');
    return null;
  }
  const bot = new Bot(env.BOT_TOKEN);

  // Отвечаем только в личных чатах (кроме чата обратной связи разработчика)
  bot.use(async (ctx, next) => {
    const isFeedbackChat = env.FEEDBACK_CHAT_ID && String(ctx.chat?.id) === env.FEEDBACK_CHAT_ID;
    if (ctx.chat && ctx.chat.type !== 'private' && !isFeedbackChat) return;
    await next();
  });

  const upsertUser = (from: { id: number; first_name: string; last_name?: string; username?: string }) =>
    prisma.user.upsert({
      where: { telegramId: String(from.id) },
      create: { telegramId: String(from.id), name: [from.first_name, from.last_name].filter(Boolean).join(' '), username: from.username ?? null },
      update: { username: from.username ?? null },
    });

  bot.command('start', async (ctx) => {
    const from = ctx.from!;
    // Заводим профиль сразу — чтобы напоминания и выгрузка работали без лишних шагов
    await upsertUser(from);

    // Ссылка входа из приложения: t.me/<бот>?start=login_<код>
    if (ctx.match.startsWith(LOGIN_PREFIX)) {
      const code = ctx.match.slice(LOGIN_PREFIX.length);
      const req = await findLoginRequest(code);
      if (!req || req.userId) {
        await ctx.reply('Эта ссылка для входа устарела. Нажмите «Войти через Telegram» в приложении ещё раз.');
        return;
      }
      await ctx.reply(
        '🔐 <b>Вход в приложение Ognivo</b>\n\n' +
          `Код входа: <b>${req.pin}</b>\n\n` +
          `Подтверждайте, только если вы сами нажали «Войти» и этот код сейчас у вас на экране. ` +
          `После подтверждения приложение получит доступ ко всем вашим записям в Ognivo.`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('✅ Подтвердить вход', `login:${code}`).text('Отмена', `nologin:${code}`),
        },
      );
      return;
    }

    const kb = openAppKeyboard();
    await ctx.reply(
      `Привет, ${escapeHtml(from.first_name)}! 🔥\n\nЯ Ognivo — трекер дел, денег и тренировок. ` +
        (hasWebApp() ? 'Нажмите кнопку ниже, чтобы открыть приложение.' : 'Приложение скоро будет доступно.') +
        '\n\nЗдесь я буду присылать напоминания, которые вы включите в настройках.',
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });

  bot.command('help', (ctx) => ctx.reply(HELP, { reply_markup: openAppKeyboard() }));

  bot.callbackQuery(/^login:([\w-]+)$/, async (ctx) => {
    const user = await upsertUser(ctx.from);
    const ok = await confirmLoginRequest(ctx.match[1], user.id);
    await ctx.answerCallbackQuery({ text: ok ? 'Вход подтверждён' : 'Ссылка устарела' });
    await ctx
      .editMessageText(
        ok
          ? '✅ Вход подтверждён. Вернитесь в приложение Ognivo — оно откроется само.'
          : 'Эта ссылка для входа устарела. Нажмите «Войти через Telegram» в приложении ещё раз.',
      )
      .catch(() => {});
  });

  bot.callbackQuery(/^nologin:([\w-]+)$/, async (ctx) => {
    await cancelLoginRequest(ctx.match[1]);
    await ctx.answerCallbackQuery({ text: 'Отменено' });
    await ctx.editMessageText('Вход отменён.').catch(() => {});
  });

  // «✅ Готово» в напоминании
  bot.callbackQuery(/^done:([^:]+):(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const [, taskId, date] = ctx.match;
    const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    const task = user && (await prisma.task.findFirst({ where: { id: taskId, userId: user.id } }));
    if (!task) return ctx.answerCallbackQuery({ text: 'Задача не найдена — возможно, её удалили' });

    if (task.repeat === 'none') {
      await prisma.task.update({ where: { id: task.id }, data: { status: 'done', doneAt: new Date() } });
    } else if (occursOn(task.date, task.repeat as Repeat, date)) {
      await prisma.taskCompletion.upsert({
        where: { taskId_date: { taskId: task.id, date } },
        create: { taskId: task.id, date },
        update: {},
      });
    }
    await ctx.answerCallbackQuery({ text: 'Отмечено ✅' });
    const old = ctx.callbackQuery.message;
    if (old && 'text' in old && old.text) {
      await ctx
        .editMessageText(`✅ ${escapeHtml(old.text)}`, { parse_mode: 'HTML', reply_markup: openAppKeyboard() })
        .catch(() => {});
    }
  });

  // Ответ разработчика на пересланную обратную связь → пользователю
  bot.on('message:text', async (ctx, next) => {
    const reply = ctx.message.reply_to_message;
    if (!env.FEEDBACK_CHAT_ID || String(ctx.chat.id) !== env.FEEDBACK_CHAT_ID || !reply) return next();
    const fb = await prisma.feedback.findFirst({ where: { adminMessageId: reply.message_id }, include: { user: true } });
    if (!fb) return ctx.reply('Не нашёл, к какому обращению относится ответ.');
    try {
      await ctx.api.sendMessage(fb.user.telegramId, `💬 Ответ на ваше сообщение:\n\n${ctx.message.text}`);
      await ctx.reply('Отправлено ✅');
    } catch {
      await ctx.reply('Не удалось отправить: пользователь, возможно, заблокировал бота.');
    }
  });

  // Любой другой текст в личке — подсказка
  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('Все записи ведутся в приложении. Команда /help — что я умею.', { reply_markup: openAppKeyboard() });
  });

  bot.catch((err) => console.error('Ошибка бота:', err.error));
  return bot;
}

/** Команды в меню бота и кнопка «Ognivo» слева от поля ввода. */
export async function setupBotProfile(bot: Bot) {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Открыть Ognivo' },
    { command: 'help', description: 'Что умеет бот' },
  ]);
  if (env.WEBAPP_URL.startsWith('https://')) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Ognivo', web_app: { url: env.WEBAPP_URL } } });
  }
}
