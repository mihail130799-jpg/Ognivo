import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { parse, HttpError } from '../lib/http.js';
import { createLoginRequest, getBotUsername, pollLoginRequest } from '../auth/appLogin.js';

// Простое ограничение частоты по IP: новых запросов входа — не больше 10 за 10 минут
const WINDOW_MS = 10 * 60_000;
const MAX_STARTS = 10;
const starts = new Map<string, number[]>();

function tooManyStarts(ip: string) {
  const now = Date.now();
  const recent = (starts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_STARTS) return true;
  recent.push(now);
  starts.set(ip, recent);
  if (starts.size > 10_000) starts.clear();
  return false;
}

const zCode = z.object({ code: z.string().min(10).max(64) }).strict();

/** Открытые маршруты входа (без авторизации). */
export async function authPublicRoutes(app: FastifyInstance) {
  app.post('/auth/login/start', async (req) => {
    if (!getBotUsername()) throw new HttpError(503, 'бот не подключён');
    if (tooManyStarts(req.ip)) throw new HttpError(429, 'слишком много попыток, подождите несколько минут');
    return createLoginRequest();
  });

  app.post('/auth/login/poll', async (req) => {
    const { code } = parse(zCode, req.body);
    const r = await pollLoginRequest(code);
    if (!r) throw new HttpError(410, 'код входа устарел — начните заново');
    return r;
  });
}

/** Маршруты для вошедшего пользователя. */
export async function authRoutes(app: FastifyInstance) {
  /** Выйти на этом устройстве (для входа через Telegram — ничего не делает). */
  app.post('/auth/logout', async (req) => {
    if (req.sessionId) await prisma.appSession.deleteMany({ where: { id: req.sessionId } });
    return { ok: true };
  });
}
