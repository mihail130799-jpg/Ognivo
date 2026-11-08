import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

/** Сколько живёт подпись initData. После — клиент должен переоткрыть Mini App. */
const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Проверка подписи initData по документации Telegram:
 * secret = HMAC_SHA256(key="WebAppData", data=botToken)
 * hash   = hex(HMAC_SHA256(key=secret, data=data_check_string))
 * Возвращает пользователя или null, если подпись неверна или устарела.
 */
export function verifyInitData(initData: string, botToken: string): TelegramUser | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    return typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}
