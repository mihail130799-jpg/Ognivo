import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { verifyInitData, type TelegramUser } from '../auth/telegram.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

const DEV_USER: TelegramUser = { id: 1, first_name: 'Разработчик', username: 'dev' };

function resolveTelegramUser(req: FastifyRequest): TelegramUser | null {
  const initData = req.headers['x-telegram-init-data'];
  const user = typeof initData === 'string' ? verifyInitData(initData, env.BOT_TOKEN) : null;
  if (user) return user;
  return env.DEV_AUTH_BYPASS ? DEV_USER : null;
}

/** Все маршруты, зарегистрированные внутри, требуют входа через Telegram. */
export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', null as unknown as User);

  app.addHook('preHandler', async (req, reply) => {
    const tgUser = resolveTelegramUser(req);
    if (!tgUser) return reply.code(401).send({ error: 'unauthorized' });

    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
    req.user = await prisma.user.upsert({
      where: { telegramId: String(tgUser.id) },
      create: { telegramId: String(tgUser.id), name, username: tgUser.username ?? null },
      update: { username: tgUser.username ?? null },
    });
  });
}
