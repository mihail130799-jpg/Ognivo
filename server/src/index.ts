import Fastify from 'fastify';
import { DEFAULT_SETTINGS, type MeResponse, type UserSettings } from '@ognivo/shared';
import { env } from './env.js';
import { prisma } from './db.js';
import { authPlugin } from './plugins/auth.js';
import { createBot } from './bot.js';

const app = Fastify({ logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' } });

app.get('/api/health', async () => ({ ok: true }));

// Защищённые маршруты (нужна подпись Telegram).
app.register(async (scope) => {
  await authPlugin(scope);

  scope.get('/api/me', async (req): Promise<MeResponse> => {
    const stored = JSON.parse(req.user.settings || '{}') as Partial<UserSettings>;
    return {
      id: req.user.id,
      telegramId: req.user.telegramId,
      name: req.user.name,
      username: req.user.username,
      settings: { ...DEFAULT_SETTINGS, ...stored },
    };
  });
});

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
