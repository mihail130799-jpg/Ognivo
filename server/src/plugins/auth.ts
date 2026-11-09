import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { verifyInitData, type TelegramUser } from '../auth/telegram.js';
import { userByToken } from '../auth/appLogin.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
    /** Сессия приложения, если вход по токену (Android, браузер); null — вход через Telegram */
    sessionId: string | null;
  }
}

const DEV_USER: TelegramUser = { id: 1, first_name: 'Разработчик', username: 'dev' };

function resolveTelegramUser(req: FastifyRequest): TelegramUser | null {
  const initData = req.headers['x-telegram-init-data'];
  const user = typeof initData === 'string' && initData ? verifyInitData(initData, env.BOT_TOKEN) : null;
  if (user) return user;
  return env.DEV_AUTH_BYPASS ? DEV_USER : null;
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

/** Все маршруты, зарегистрированные внутри, требуют входа: через Telegram или по токену приложения. */
export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', null as unknown as User);
  app.decorateRequest('sessionId', null);

  app.addHook('preHandler', async (req, reply) => {
    const token = bearer(req);
    if (token) {
      const s = await userByToken(token);
      if (!s) return reply.code(401).send({ error: 'unauthorized' });
      req.user = s.user;
      req.sessionId = s.sessionId;
      return;
    }

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
