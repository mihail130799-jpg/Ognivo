// Чистая логика: какие напоминания пора отправить пользователю в момент now.
// Без обращения к базе и сети — поэтому легко тестируется.

import { addDays, occursOn, todayIn, weekday, type Repeat } from '@ognivo/shared';
import { zonedToUtc } from '../lib/time.js';

export interface PlanTask {
  id: string;
  kind: string; // 'task' | 'event'
  title: string;
  date: string | null;
  time: string | null;
  repeat: string;
  remind: string; // 'none' | 'ontime' | '15m' | '1h' | '1d'
  status: string;
  completions: string[];
}

export interface PlanWorkout {
  id: string;
  title: string;
  date: string;
  status: string;
  exercises: number;
}

export interface PlanInput {
  timezone: string;
  notifications: { tasks: boolean; events: boolean; workouts: boolean };
  trainingDays: number[];
  tasks: PlanTask[];
  workouts: PlanWorkout[];
}

export interface Reminder {
  /** Уникальный ключ вхождения — по нему не отправляем повторно */
  key: string;
  type: 'task' | 'event' | 'workout' | 'training_day';
  text: string;
  /** Для задач — кнопка «Готово» */
  done?: { taskId: string; date: string };
}

/** Время по умолчанию для задач без времени и для тренировок. */
export const DEFAULT_TIME = '09:00';
/** Если сервер был выключен, не присылаем напоминания старше этого окна. */
export const LATE_WINDOW_MS = 3 * 60 * 60 * 1000;

const OFFSET_MS: Record<string, number> = {
  ontime: 0,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function whenText(date: string, time: string | null, today: string): string {
  const day = date === today ? 'сегодня' : date === addDays(today, 1) ? 'завтра' : date === addDays(today, -1) ? 'вчера' : date.split('-').reverse().join('.');
  return time ? `${day} в ${time}` : day;
}

function isDue(dueAt: Date, now: Date): boolean {
  const diff = now.getTime() - dueAt.getTime();
  return diff >= 0 && diff < LATE_WINDOW_MS;
}

export function dueReminders(input: PlanInput, now: Date): Reminder[] {
  const out: Reminder[] = [];
  const today = todayIn(input.timezone, now);
  const n = input.notifications;

  // ── Задачи и события ──
  for (const t of input.tasks) {
    if (!t.date || t.remind === 'none' || !(t.remind in OFFSET_MS)) continue;
    const isEvent = t.kind === 'event';
    if (isEvent ? !n.events : !n.tasks) continue;

    // Напоминание «за день» может относиться к завтрашнему вхождению; «вчерашнее» — к опоздавшему
    for (let d = addDays(today, -1); d <= addDays(today, 2); d = addDays(d, 1)) {
      if (!occursOn(t.date, t.repeat as Repeat, d)) continue;
      const done = t.repeat === 'none' ? t.status === 'done' : t.completions.includes(d);
      if (done) continue;
      const at = zonedToUtc(d, t.time ?? DEFAULT_TIME, input.timezone);
      const dueAt = new Date(at.getTime() - OFFSET_MS[t.remind]);
      if (!isDue(dueAt, now)) continue;

      const title = `<b>${escapeHtml(t.title)}</b>`;
      const when = whenText(d, t.time, today);
      out.push({
        key: `task:${t.id}:${d}`,
        type: isEvent ? 'event' : 'task',
        text: isEvent ? `📅 Событие: ${title}\n${capitalize(when)}` : `⏰ Напоминание: ${title}\n${capitalize(when)}`,
        done: isEvent ? undefined : { taskId: t.id, date: d },
      });
    }
  }

  // ── Тренировки: утром в день тренировки ──
  if (n.workouts) {
    const dueAt = zonedToUtc(today, DEFAULT_TIME, input.timezone);
    if (isDue(dueAt, now)) {
      const w = input.workouts.find((x) => x.date === today);
      if (w && w.status !== 'done') {
        out.push({
          key: `workout:${w.id}:${today}`,
          type: 'workout',
          text: `🏋️ Сегодня тренировка: <b>${escapeHtml(w.title)}</b>\n${w.exercises} ${plural(w.exercises, ['упражнение', 'упражнения', 'упражнений'])}. Удачи!`,
        });
      } else if (!w && input.trainingDays.includes(weekday(today))) {
        out.push({
          key: `training_day:${today}`,
          type: 'training_day',
          text: '🏋️ Сегодня тренировочный день. Составьте план в Ognivo — он подберётся автоматически.',
        });
      }
    }
  }

  return out;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function plural(n: number, f: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b > 1 && b < 5) return f[1];
  if (b === 1) return f[0];
  return f[2];
}
