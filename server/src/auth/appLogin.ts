// Вход в Ognivo вне Telegram (Android-приложение, браузер).
//
// 1. Приложение: POST /api/auth/login/start → секретный код + ссылка на бота + короткий PIN.
// 2. Пользователь открывает ссылку, бот показывает PIN и кнопку «Подтвердить».
// 3. Приложение опрашивает POST /api/auth/login/poll и после подтверждения получает токен.
// Токен хранится только на устройстве, в базе — его sha256.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma } from '../db.js';

export const LOGIN_TTL_MS = 10 * 60_000;
export const LOGIN_PREFIX = 'login_';

let botUsername = '';
export function setBotUsername(name: string) {
  botUsername = name;
}
export function getBotUsername() {
  return botUsername;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createLoginRequest() {
  // Старые запросы чистим здесь же — отдельный планировщик не нужен
  await prisma.loginRequest.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const id = randomBytes(16).toString('base64url');
  const pin = String(randomInt(0, 10_000)).padStart(4, '0');
  const expiresAt = new Date(Date.now() + LOGIN_TTL_MS);
  await prisma.loginRequest.create({ data: { id, pin, expiresAt } });
  return { code: id, pin, expiresAt, url: `https://t.me/${botUsername}?start=${LOGIN_PREFIX}${id}` };
}

/** Действующий (не истёкший) запрос входа. */
export async function findLoginRequest(code: string) {
  const req = await prisma.loginRequest.findUnique({ where: { id: code } });
  return req && req.expiresAt > new Date() ? req : null;
}

/** Подтверждение из бота. false — запрос не найден, истёк или уже подтверждён. */
export async function confirmLoginRequest(code: string, userId: string) {
  const r = await prisma.loginRequest.updateMany({
    where: { id: code, userId: null, expiresAt: { gt: new Date() } },
    data: { userId },
  });
  return r.count === 1;
}

export async function cancelLoginRequest(code: string) {
  await prisma.loginRequest.deleteMany({ where: { id: code, userId: null } });
}

/**
 * Опрос из приложения. pending — ждём подтверждения; token — выдаётся один раз,
 * запрос сразу удаляется; null — кода нет или он истёк/отменён.
 */
export async function pollLoginRequest(code: string): Promise<{ status: 'pending' } | { status: 'ok'; token: string } | null> {
  const req = await findLoginRequest(code);
  if (!req) return null;
  if (!req.userId) return { status: 'pending' };
  // deleteMany вернёт 1 только одному из параллельных запросов — токен не выдастся дважды
  const del = await prisma.loginRequest.deleteMany({ where: { id: code } });
  if (del.count !== 1) return null;
  const token = randomBytes(32).toString('base64url');
  await prisma.appSession.create({ data: { userId: req.userId, tokenHash: hashToken(token) } });
  return { status: 'ok', token };
}

/** Пользователь по токену сессии (заголовок Authorization: Bearer …). */
export async function userByToken(token: string) {
  const session = await prisma.appSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  // Отметку «последнее использование» обновляем не чаще раза в час
  if (Date.now() - session.lastUsedAt.getTime() > 3600_000) {
    await prisma.appSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { user: session.user, sessionId: session.id };
}
