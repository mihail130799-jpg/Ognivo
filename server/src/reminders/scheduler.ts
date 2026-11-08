// Раз в минуту проверяет, кому пора прислать напоминание, и отправляет через бота.

import type { Api } from 'grammy';
import { Prisma } from '@prisma/client';
import { addDays, mergeSettings, todayIn } from '@ognivo/shared';
import { prisma } from '../db.js';
import { dueReminders } from './plan.js';
import { reminderKeyboard } from './keyboard.js';

const TICK_MS = 60_000;

/** Одна проверка всех пользователей. Возвращает число отправленных сообщений. */
export async function runReminders(api: Api, now = new Date()): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true, telegramId: true, timezone: true, settings: true } });
  let sent = 0;

  for (const u of users) {
    let settings;
    try {
      settings = mergeSettings(JSON.parse(u.settings || '{}'));
    } catch {
      continue;
    }
    const n = settings.notifications;
    if (!n.tasks && !n.events && !n.workouts) continue;

    const today = todayIn(u.timezone, now);
    const [tasks, workouts] = await Promise.all([
      n.tasks || n.events
        ? prisma.task.findMany({
            where: { userId: u.id, remind: { not: 'none' }, date: { not: null, lte: addDays(today, 2) } },
            include: { completions: { where: { date: { gte: addDays(today, -1), lte: addDays(today, 2) } } } },
          })
        : [],
      n.workouts
        ? prisma.workout.findMany({ where: { userId: u.id, date: today }, include: { _count: { select: { exercises: true } } } })
        : [],
    ]);

    const reminders = dueReminders(
      {
        timezone: u.timezone,
        notifications: n,
        trainingDays: settings.trainingDays,
        tasks: tasks.map((t) => ({ ...t, completions: t.completions.map((c) => c.date) })),
        workouts: workouts.map((w) => ({ id: w.id, title: w.title, date: w.date, status: w.status, exercises: w._count.exercises })),
      },
      now,
    );

    for (const r of reminders) {
      // Сначала «занимаем» ключ в журнале: если он уже есть — напоминание отправлялось
      try {
        await prisma.reminderLog.create({ data: { userId: u.id, key: r.key } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
      try {
        await api.sendMessage(u.telegramId, r.text, { parse_mode: 'HTML', reply_markup: reminderKeyboard(r.done) });
        sent++;
      } catch (e) {
        // Например, пользователь не запускал бота или заблокировал его — не повторяем
        await prisma.reminderLog.update({
          where: { userId_key: { userId: u.id, key: r.key } },
          data: { error: String((e as Error).message ?? e).slice(0, 500) },
        });
      }
    }
  }
  return sent;
}

/** Чистим журнал старше 14 дней, чтобы таблица не росла бесконечно. */
async function cleanup() {
  await prisma.reminderLog.deleteMany({ where: { sentAt: { lt: new Date(Date.now() - 14 * 86400_000) } } });
}

export function startReminderScheduler(api: Api, log: (msg: string, err?: unknown) => void): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // предыдущая проверка ещё идёт
    running = true;
    try {
      const n = await runReminders(api);
      if (n) log(`Отправлено напоминаний: ${n}`);
    } catch (e) {
      log('Ошибка планировщика напоминаний', e);
    } finally {
      running = false;
    }
  };
  // Первая проверка — в начале следующей минуты, дальше раз в минуту
  const first = setTimeout(() => {
    void tick();
    timer = setInterval(tick, TICK_MS);
  }, TICK_MS - (Date.now() % TICK_MS) + 1_000);
  let timer: NodeJS.Timeout | undefined;
  const daily = setInterval(() => void cleanup().catch(() => {}), 24 * 3600_000);
  return () => {
    clearTimeout(first);
    if (timer) clearInterval(timer);
    clearInterval(daily);
  };
}
