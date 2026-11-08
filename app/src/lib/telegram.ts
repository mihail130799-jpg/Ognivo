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
  onEvent(event: 'homeScreenAdded', cb: () => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  openLink?(url: string): void;
  requestWriteAccess?(cb?: (granted: boolean) => void): void;
  isVersionAtLeast?(version: string): boolean;
  version?: string;
  platform?: string;
  // Bot API 8.0+: ярлык мини-приложения на домашнем экране
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb: (status: HomeScreenStatus) => void): void;
  offEvent?(event: string, cb: (...args: never[]) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

/** unsupported — клиент не умеет; unknown — нельзя узнать; added — уже есть; missed — можно добавить */
export type HomeScreenStatus = 'unsupported' | 'unknown' | 'added' | 'missed';

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

/** Открыть ссылку: в Telegram — встроенным браузером, иначе в новой вкладке. */
export function openLink(url: string): void {
  const abs = new URL(url, location.href).href;
  if (isInTelegram && tg?.openLink) tg.openLink(abs);
  else window.open(abs, '_blank', 'noopener');
}

/**
 * Разрешение боту писать пользователю (нужно для напоминаний и выгрузки).
 * Вне Telegram или в старых клиентах просто возвращает true.
 */
export function requestWriteAccess(): Promise<boolean> {
  if (!isInTelegram || !tg?.requestWriteAccess || !tg.isVersionAtLeast?.('6.9')) return Promise.resolve(true);
  return new Promise((resolve) => tg!.requestWriteAccess!((granted) => resolve(granted)));
}

/** «Telegram ios · Bot API 8.0» — для диагностики в настройках. */
export function telegramClientInfo(): string | null {
  if (!isInTelegram || !tg) return null;
  return `Telegram ${tg.platform ?? '?'} · Bot API ${tg.version ?? '?'}`;
}

/** Умеет ли клиент Telegram добавлять ярлык на домашний экран (iOS/Android, Telegram 11.5+). */
export function canAddToHomeScreen(): boolean {
  return isInTelegram && !!tg?.addToHomeScreen && !!tg.isVersionAtLeast?.('8.0');
}

/** Есть ли уже ярлык на домашнем экране. */
export function checkHomeScreenStatus(): Promise<HomeScreenStatus> {
  if (!canAddToHomeScreen() || !tg?.checkHomeScreenStatus) return Promise.resolve('unsupported');
  return new Promise((resolve) => {
    // На некоторых клиентах колбэк не вызывается — не ждём вечно
    const t = setTimeout(() => resolve('unknown'), 3000);
    tg!.checkHomeScreenStatus!((s) => {
      clearTimeout(t);
      resolve(s);
    });
  });
}

/** Показать системный диалог «Добавить на домашний экран». onAdded — если пользователь подтвердил. */
export function addToHomeScreen(onAdded?: () => void): void {
  if (!canAddToHomeScreen()) return;
  if (onAdded) {
    const handler = () => {
      tg!.offEvent?.('homeScreenAdded', handler);
      onAdded();
    };
    tg!.onEvent('homeScreenAdded', handler);
  }
  tg!.addToHomeScreen!();
}

export function haptic(kind: 'tap' | 'success' = 'tap'): void {
  if (kind === 'success') tg?.HapticFeedback?.notificationOccurred('success');
  else tg?.HapticFeedback?.impactOccurred('light');
}
