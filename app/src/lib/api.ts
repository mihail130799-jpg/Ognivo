import { getInitData, isInTelegram } from './telegram';
import { API_BASE, getToken } from './platform';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Заголовок входа: в Telegram — подпись initData, вне Telegram — токен приложения. */
export function authHeaders(): Record<string, string> {
  if (isInTelegram) return { 'X-Telegram-Init-Data': getInitData() };
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Запрос к нашему API. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      // Content-Type только при наличии тела: Fastify отклоняет пустое тело с типом JSON
      ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || res.statusText);
  }
  return (await res.json()) as T;
}
