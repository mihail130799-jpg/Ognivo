import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedToUtc } from '../src/lib/time.js';
import { dueReminders, type PlanInput, type PlanTask } from '../src/reminders/plan.js';

const at = (iso: string) => new Date(iso);

test('zonedToUtc: Москва, Алматы, переход на летнее время в Берлине', () => {
  assert.equal(zonedToUtc('2026-11-08', '18:30', 'Europe/Moscow').toISOString(), '2026-11-08T15:30:00.000Z');
  assert.equal(zonedToUtc('2026-11-08', '09:00', 'Asia/Almaty').toISOString(), '2026-11-08T04:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-29', '12:00', 'Europe/Berlin').toISOString(), '2026-03-29T10:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-28', '12:00', 'Europe/Berlin').toISOString(), '2026-03-28T11:00:00.000Z');
});

function task(p: Partial<PlanTask>): PlanTask {
  return { id: 't1', kind: 'task', title: 'Позвонить маме', date: '2026-11-08', time: '18:30', repeat: 'none', remind: 'ontime', status: 'planned', completions: [], ...p };
}

function input(p: Partial<PlanInput>): PlanInput {
  return {
    timezone: 'Europe/Moscow',
    notifications: { tasks: true, events: true, workouts: true },
    trainingDays: [],
    tasks: [],
    workouts: [],
    ...p,
  };
}

test('задача «вовремя»: приходит в 18:30 по Москве, не раньше', () => {
  const inp = input({ tasks: [task({})] });
  assert.equal(dueReminders(inp, at('2026-11-08T15:29:00Z')).length, 0);
  const r = dueReminders(inp, at('2026-11-08T15:30:30Z'));
  assert.equal(r.length, 1);
  assert.equal(r[0].key, 'task:t1:2026-11-08');
  assert.match(r[0].text, /Позвонить маме/);
  assert.match(r[0].text, /Сегодня в 18:30/);
  assert.deepEqual(r[0].done, { taskId: 't1', date: '2026-11-08' });
});

test('смещения: за 15 мин, за час, за день', () => {
  assert.equal(dueReminders(input({ tasks: [task({ remind: '15m' })] }), at('2026-11-08T15:15:00Z')).length, 1);
  assert.equal(dueReminders(input({ tasks: [task({ remind: '1h' })] }), at('2026-11-08T14:30:00Z')).length, 1);
  const day = dueReminders(input({ tasks: [task({ remind: '1d' })] }), at('2026-11-07T15:30:00Z'));
  assert.equal(day.length, 1);
  assert.match(day[0].text, /Завтра в 18:30/);
});

test('без времени — в 9:00', () => {
  assert.equal(dueReminders(input({ tasks: [task({ time: null })] }), at('2026-11-08T05:59:00Z')).length, 0);
  assert.equal(dueReminders(input({ tasks: [task({ time: null })] }), at('2026-11-08T06:00:00Z')).length, 1);
});

test('не напоминаем: выполнено, выключено в настройках, «Нет», сильно опоздали', () => {
  const now = at('2026-11-08T15:31:00Z');
  assert.equal(dueReminders(input({ tasks: [task({ status: 'done' })] }), now).length, 0);
  assert.equal(dueReminders(input({ tasks: [task({ remind: 'none' })] }), now).length, 0);
  assert.equal(dueReminders(input({ tasks: [task({})], notifications: { tasks: false, events: true, workouts: true } }), now).length, 0);
  assert.equal(dueReminders(input({ tasks: [task({})] }), at('2026-11-08T19:00:00Z')).length, 0, 'старше 3 часов');
});

test('повторяющаяся задача: напоминание на каждое вхождение, отметка дня его отменяет', () => {
  const t = task({ date: '2026-11-01', repeat: 'day', time: '08:00' });
  const r = dueReminders(input({ tasks: [t] }), at('2026-11-08T05:00:00Z'));
  assert.deepEqual(r.map((x) => x.key), ['task:t1:2026-11-08']);
  assert.equal(dueReminders(input({ tasks: [{ ...t, completions: ['2026-11-08'] }] }), at('2026-11-08T05:00:00Z')).length, 0);
});

test('событие: без кнопки «Готово», отдельная настройка', () => {
  const ev = task({ kind: 'event', title: 'Ужин <с друзьями>', time: '19:00', remind: '1h' });
  const r = dueReminders(input({ tasks: [ev] }), at('2026-11-08T15:00:00Z'));
  assert.equal(r.length, 1);
  assert.equal(r[0].done, undefined);
  assert.match(r[0].text, /Ужин &lt;с друзьями&gt;/, 'HTML экранируется');
  assert.equal(dueReminders(input({ tasks: [ev], notifications: { tasks: true, events: false, workouts: true } }), at('2026-11-08T15:00:00Z')).length, 0);
});

test('тренировки: запланированная, тренировочный день без плана, отдых', () => {
  const now = at('2026-11-08T06:05:00Z'); // 9:05 по Москве, воскресенье
  const w = { id: 'w1', title: 'Грудь', date: '2026-11-08', status: 'planned', exercises: 5 };
  assert.match(dueReminders(input({ workouts: [w] }), now)[0].text, /Сегодня тренировка: <b>Грудь<\/b>\n5 упражнений/);
  assert.equal(dueReminders(input({ workouts: [{ ...w, status: 'done' }] }), now).length, 0);
  assert.equal(dueReminders(input({ trainingDays: [6] }), now)[0].type, 'training_day');
  assert.equal(dueReminders(input({ trainingDays: [0] }), now).length, 0);
});
