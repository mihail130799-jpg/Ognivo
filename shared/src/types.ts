// Общие типы между Mini App и сервером. Будут расширяться на этапе 3 (API).

export type Currency = 'RUB' | 'USD' | 'EUR' | 'KZT';
export type ThemeMode = 'light' | 'dark' | 'system';

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  KZT: '₸',
};

export interface UserSettings {
  theme: ThemeMode;
  currency: Currency;
  animations: boolean;
  sections: { plan: boolean; money: boolean; sport: boolean };
  homeBlocks: {
    tasks: boolean;
    events: boolean;
    workout: boolean;
    finance: boolean;
    savings: boolean;
  };
  notifications: { tasks: boolean; events: boolean; workouts: boolean };
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  currency: 'RUB',
  animations: true,
  sections: { plan: true, money: true, sport: true },
  homeBlocks: { tasks: true, events: true, workout: true, finance: true, savings: true },
  notifications: { tasks: false, events: false, workouts: false },
};

export interface MeResponse {
  id: string;
  telegramId: string;
  name: string;
  username: string | null;
  settings: UserSettings;
}
