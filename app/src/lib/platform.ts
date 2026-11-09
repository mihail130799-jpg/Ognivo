// Где запущен Ognivo: Telegram Mini App, Android-приложение (Capacitor) или обычный браузер.
import { Capacitor } from '@capacitor/core';

/** true — Android-приложение. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Адрес сервера. В Telegram и браузере — тот же сайт (''), в Android-приложении
 * интерфейс лежит внутри APK, поэтому API — на полном адресе (VITE_API_BASE при сборке).
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

/** Открыть ссылку во внешнем приложении (Telegram, браузер). */
export async function openExternal(url: string): Promise<void> {
  if (isNative) {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    await AppLauncher.openUrl({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Вызвать cb, когда пользователь вернулся в приложение (например, из Telegram). */
export function onResume(cb: () => void): () => void {
  const onVis = () => document.visibilityState === 'visible' && cb();
  document.addEventListener('visibilitychange', onVis);
  let remove: (() => void) | undefined;
  if (isNative) {
    import('@capacitor/app').then(({ App }) =>
      App.addListener('resume', cb).then((h) => {
        remove = () => h.remove();
      }),
    );
  }
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    remove?.();
  };
}

// ── Токен входа (вне Telegram) ──

const TOKEN_KEY = 'ognivo.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* хранилище недоступно */
  }
}
