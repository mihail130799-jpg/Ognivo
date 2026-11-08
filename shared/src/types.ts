// Общие типы между Mini App и сервером (формат ответов API).

import type { CategoryKind } from './categories';
import type { DateStr, Repeat } from './dates';
import type { ExerciseUnit } from './exercises';

export const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'VND'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type ThemeMode = 'light' | 'dark' | 'system';

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  KZT: '₸',
  VND: '₫',
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
  /** Тренировочные дни недели: 0 — понедельник … 6 — воскресенье */
  trainingDays: number[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  currency: 'RUB',
  animations: true,
  sections: { plan: true, money: true, sport: true },
  homeBlocks: { tasks: true, events: true, workout: true, finance: true, savings: true },
  notifications: { tasks: false, events: false, workouts: false },
  trainingDays: [],
};

/** Глубокое слияние сохранённых настроек с настройками по умолчанию. */
export function mergeSettings(stored: Partial<UserSettings> | null | undefined): UserSettings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    sections: { ...DEFAULT_SETTINGS.sections, ...s.sections },
    homeBlocks: { ...DEFAULT_SETTINGS.homeBlocks, ...s.homeBlocks },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...s.notifications },
    trainingDays: Array.isArray(s.trainingDays) ? s.trainingDays : DEFAULT_SETTINGS.trainingDays,
  };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

export interface MeResponse {
  id: string;
  telegramId: string;
  name: string;
  username: string | null;
  timezone: string;
  today: DateStr;
  settings: UserSettings;
}

// ── План ──────────────────────────────────────────────

export type TaskKind = 'task' | 'event';
export type TaskStatus = 'planned' | 'in_progress' | 'done';
export type Remind = 'none' | 'ontime' | '15m' | '1h' | '1d';

export interface TaskDto {
  id: string;
  kind: TaskKind;
  title: string;
  date: DateStr | null;
  time: string | null;
  repeat: Repeat;
  remind: Remind;
  status: TaskStatus;
  comment: string;
  /** Для повторяющихся задач — даты, в которые задача отмечена выполненной */
  doneDates: DateStr[];
  createdAt: string;
}

export interface HabitDto {
  id: string;
  title: string;
  emoji: string;
  sortOrder: number;
  /** Даты отметок в запрошенном диапазоне */
  checks: DateStr[];
}

// ── Деньги ────────────────────────────────────────────

export interface TransactionDto {
  id: string;
  kind: CategoryKind;
  /** В копейках */
  amount: number;
  categoryId: string;
  date: DateStr;
  comment: string;
}

export interface MoneySummary {
  income: number;
  expense: number;
  balance: number;
  byCategory: { categoryId: string; kind: CategoryKind; total: number }[];
}

export interface SavingsGoalDto {
  id: string;
  title: string;
  emoji: string;
  target: number;
  saved: number;
  deadline: DateStr | null;
}

export interface SavingsMoveDto {
  id: string;
  amount: number;
  date: DateStr;
  comment: string;
}

// ── Спорт ─────────────────────────────────────────────

export interface WorkoutSetDto {
  id?: string;
  reps: number | null;
  weight: number | null;
  durationSec: number | null;
  done: boolean;
}

export interface WorkoutExerciseDto {
  id?: string;
  exerciseId: string;
  title: string;
  unit: ExerciseUnit;
  sets: WorkoutSetDto[];
}

export interface WorkoutDto {
  id: string;
  title: string;
  date: DateStr;
  status: 'planned' | 'done';
  note: string;
  finishedAt: string | null;
  exercises: WorkoutExerciseDto[];
}
