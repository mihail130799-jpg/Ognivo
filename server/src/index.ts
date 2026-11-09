import { env } from './env.js';
import { prisma } from './db.js';
import { buildApp } from './app.js';
import { createBot, setupBotProfile } from './bot.js';
import { startReminderScheduler } from './reminders/scheduler.js';
import { setBotUsername } from './auth/appLogin.js';

const app = buildApp();
const bot = createBot();
let stopScheduler: (() => void) | undefined;

async function main() {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  if (env.DEV_AUTH_BYPASS) console.warn('⚠ DEV_AUTH_BYPASS включён: вход без Telegram разрешён.');
  if (bot) {
    setupBotProfile(bot).catch((e) => console.error('Не удалось настроить меню бота:', e.message));
    bot.start({
      onStart: (me) => {
        setBotUsername(me.username);
        console.log(`Бот @${me.username} запущен`);
      },
    }).catch((e) => {
      console.error('Не удалось запустить бота:', e.message);
    });
    stopScheduler = startReminderScheduler(bot.api, (msg, err) =>
      err ? console.error(msg, err) : console.log(msg),
    );
  }
}

async function shutdown() {
  stopScheduler?.();
  await bot?.stop();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
