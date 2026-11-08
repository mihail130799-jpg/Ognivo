// Тонкая обёртка над Telegram WebApp SDK (скрипт telegram-web-app.js в index.html).
// Описаны только те поля, которые используем.

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser };
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  onEvent(event: 'themeChanged', cb: () => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;

/** true, если приложение открыто внутри Telegram (есть подписанные initData). */
export const isInTelegram = Boolean(tg?.initData);

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
}

export function getInitData(): string {
  return tg?.initData ?? '';
}

export function getTelegramName(): string | null {
  return tg?.initDataUnsafe.user?.first_name ?? null;
}

export function systemColorScheme(): 'light' | 'dark' {
  // Вне Telegram скрипт SDK всё равно создаёт WebApp с colorScheme = 'light' — ему не верим
  if (isInTelegram && tg?.colorScheme) return tg.colorScheme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Подтверждение действия: в Telegram — нативный диалог, в браузере — window.confirm. */
export function confirmAction(message: string): Promise<boolean> {
  if (isInTelegram && tg?.showConfirm) {
    return new Promise((resolve) => tg!.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function haptic(kind: 'tap' | 'success' = 'tap'): void {
  if (kind === 'success') tg?.HapticFeedback?.notificationOccurred('success');
  else tg?.HapticFeedback?.impactOccurred('light');
}
