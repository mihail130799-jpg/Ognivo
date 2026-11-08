import { env } from './env.js';
import { prisma } from './db.js';
import { buildApp } from './app.js';
import { createBot } from './bot.js';

const app = buildApp();
const bot = createBot();

async function main() {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  if (env.DEV_AUTH_BYPASS) console.warn('⚠ DEV_AUTH_BYPASS включён: вход без Telegram разрешён.');
  if (bot) {
    bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) }).catch((e) => {
      console.error('Не удалось запустить бота:', e);
    });
  }
}

async function shutdown() {
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
