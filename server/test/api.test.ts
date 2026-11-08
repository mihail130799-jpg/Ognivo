// Интеграционные тесты API на отдельной тестовой базе SQLite.
// Запуск: npm test -w server

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const BOT_TOKEN = '123456:TEST_TOKEN_FOR_TESTS_ONLY';
process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = BOT_TOKEN;
process.env.DATABASE_URL = 'file:./test.db';
process.env.DEV_AUTH_BYPASS = 'false';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Подписывает initData так же, как это делает Telegram. */
function initDataFor(user: { id: number; first_name: string }, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user), query_id: 'q' });
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return params.toString();
}

const ALICE = initDataFor({ id: 1001, first_name: 'Алиса' });
const BOB = initDataFor({ id: 1002, first_name: 'Боб' });

let app: FastifyInstance;

async function call(method: string, url: string, body?: unknown, auth = ALICE) {
  const res = await app.inject({
    method: method as 'GET',
    url: `/api${url}`,
    headers: auth ? { 'x-telegram-init-data': auth } : {},
    payload: body as object,
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

before(async () => {
  // Отдельный одноразовый файл тестовой базы: удаляем и создаём заново (dev.db не трогаем)
  for (const f of ['test.db', 'test.db-journal']) rmSync(path.join(serverDir, 'prisma', f), { force: true });
  execSync('npx prisma db push --skip-generate', {
    cwd: serverDir,
    env: { ...process.env },
    stdio: 'ignore',
  });
  const { buildApp } = await import('../src/app.js');
  app = buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app?.close();
  const { prisma } = await import('../src/db.js');
  await prisma.$disconnect();
});

// ── Вход ──

test('без подписи Telegram — 401', async () => {
  const r = await call('GET', '/me', undefined, '');
  assert.equal(r.status, 401);
});

test('подделанная подпись — 401', async () => {
  const forged = ALICE.replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64));
  assert.equal((await call('GET', '/me', undefined, forged)).status, 401);
});

test('устаревшая подпись — 401', async () => {
  const old = initDataFor({ id: 1001, first_name: 'Алиса' }, Math.floor(Date.now() / 1000) - 2 * 86400);
  assert.equal((await call('GET', '/me', undefined, old)).status, 401);
});

test('профиль создаётся при первом входе, настройки по умолчанию', async () => {
  const r = await call('GET', '/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Алиса');
  assert.equal(r.body.settings.currency, 'RUB');
  assert.match(r.body.today, /^\d{4}-\d{2}-\d{2}$/);
});

test('изменение настроек сливается с текущими', async () => {
  const r = await call('PATCH', '/me', {
    name: 'Алиса К.',
    timezone: 'Asia/Almaty',
    settings: { currency: 'KZT', homeBlocks: { savings: false }, trainingDays: [4, 0, 2, 2] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Алиса К.');
  assert.equal(r.body.timezone, 'Asia/Almaty');
  assert.equal(r.body.settings.currency, 'KZT');
  assert.equal(r.body.settings.homeBlocks.savings, false);
  assert.equal(r.body.settings.homeBlocks.tasks, true);
  assert.deepEqual(r.body.settings.trainingDays, [0, 2, 4]);
  assert.equal((await call('PATCH', '/me', { timezone: 'Mars/Base' })).status, 400);
  assert.equal((await call('PATCH', '/me', { settings: { currency: 'BTC' } })).status, 400);
});

// ── План ──

test('задачи: создание, правка, отметка, удаление', async () => {
  const c = await call('POST', '/tasks', { title: 'Позвонить маме', date: '2026-11-08', time: '18:30', remind: '15m' });
  assert.equal(c.status, 201);
  assert.equal(c.body.status, 'planned');
  const id = c.body.id;

  assert.equal((await call('PATCH', `/tasks/${id}`, { status: 'in_progress' })).body.status, 'in_progress');
  assert.equal((await call('POST', `/tasks/${id}/toggle`, {})).body.status, 'done');
  assert.equal((await call('POST', `/tasks/${id}/toggle`, {})).body.status, 'planned');

  const list = await call('GET', '/tasks');
  assert.equal(list.body.length, 1);
  assert.equal((await call('DELETE', `/tasks/${id}`)).status, 200);
  assert.equal((await call('GET', '/tasks')).body.length, 0);
});

test('задачи: проверки полей', async () => {
  assert.equal((await call('POST', '/tasks', { title: '   ' })).status, 400);
  assert.equal((await call('POST', '/tasks', { title: 'x', date: '08.11.2026' })).status, 400);
  assert.equal((await call('POST', '/tasks', { title: 'x', time: '25:00', date: '2026-11-08' })).status, 400);
  assert.equal((await call('POST', '/tasks', { title: 'x', repeat: 'week' })).status, 400, 'повтор без даты');
  assert.equal((await call('POST', '/tasks', { title: 'x', hacker: true })).status, 400, 'лишние поля');
  const noDate = await call('POST', '/tasks', { title: 'Когда-нибудь', kind: 'task' });
  assert.equal(noDate.status, 201);
  assert.equal(noDate.body.date, null);
});

test('повторяющаяся задача: отметки по датам', async () => {
  const t = (await call('POST', '/tasks', { title: 'Спортзал', date: '2026-11-02', repeat: 'week' })).body;
  assert.equal((await call('POST', `/tasks/${t.id}/toggle`, {})).status, 400, 'нужна дата');
  assert.equal((await call('POST', `/tasks/${t.id}/toggle`, { date: '2026-11-03' })).status, 400, 'не тот день');
  const r = await call('POST', `/tasks/${t.id}/toggle`, { date: '2026-11-09' });
  assert.deepEqual(r.body.doneDates, ['2026-11-09']);
  const r2 = await call('POST', `/tasks/${t.id}/toggle`, { date: '2026-11-09' });
  assert.deepEqual(r2.body.doneDates, []);
});

test('событие создаётся с kind=event', async () => {
  const e = await call('POST', '/tasks', { kind: 'event', title: 'Ужин с друзьями', date: '2026-11-08', time: '19:00' });
  assert.equal(e.body.kind, 'event');
});

test('привычки: отметки за период', async () => {
  const h = (await call('POST', '/habits', { title: 'Вода', emoji: '💧' })).body;
  assert.equal((await call('POST', `/habits/${h.id}/check`, { date: '2026-11-07' })).body.checked, true);
  await call('POST', `/habits/${h.id}/check`, { date: '2026-11-08' });
  const list = await call('GET', '/habits?from=2026-11-08&to=2026-11-14');
  assert.deepEqual(list.body[0].checks, ['2026-11-08']);
  assert.equal((await call('POST', `/habits/${h.id}/check`, { date: '2026-11-08' })).body.checked, false);
  assert.equal((await call('GET', '/habits?from=2026-11-10&to=2026-11-01')).status, 400);
});

// ── Деньги ──

test('операции и итоги по категориям', async () => {
  await call('POST', '/transactions', { kind: 'income', amount: 9_500_000, categoryId: 'salary', date: '2026-11-05' });
  await call('POST', '/transactions', { kind: 'expense', amount: 3_500_000, categoryId: 'housing', date: '2026-11-05' });
  await call('POST', '/transactions', { kind: 'expense', amount: 234_000, categoryId: 'groceries', date: '2026-11-08' });
  await call('POST', '/transactions', { kind: 'expense', amount: 100_000, categoryId: 'groceries', date: '2026-10-20' });

  const s = await call('GET', '/transactions/summary?from=2026-11-01&to=2026-11-30');
  assert.equal(s.body.income, 9_500_000);
  assert.equal(s.body.expense, 3_734_000);
  assert.equal(s.body.balance, 5_766_000);
  assert.equal(s.body.byCategory[0].categoryId, 'salary');

  const all = await call('GET', '/transactions/summary');
  assert.equal(all.body.expense, 3_834_000);

  const list = await call('GET', '/transactions?from=2026-11-01&to=2026-11-30');
  assert.equal(list.body.length, 3);
  assert.equal(list.body[0].date, '2026-11-08', 'новые сверху');
});

test('операции: проверки категории и суммы', async () => {
  assert.equal((await call('POST', '/transactions', { kind: 'expense', amount: 100, categoryId: 'salary', date: '2026-11-08' })).status, 400);
  assert.equal((await call('POST', '/transactions', { kind: 'expense', amount: 100, categoryId: 'nope', date: '2026-11-08' })).status, 400);
  assert.equal((await call('POST', '/transactions', { kind: 'expense', amount: -5, categoryId: 'cafe', date: '2026-11-08' })).status, 400);
  assert.equal((await call('POST', '/transactions', { kind: 'expense', amount: 1.5, categoryId: 'cafe', date: '2026-11-08' })).status, 400);
  const big = await call('POST', '/transactions', { kind: 'income', amount: 5_000_000_000, categoryId: 'invest', date: '2026-11-08' });
  assert.equal(big.status, 201, 'суммы больше 21 млн ₽ поддерживаются');
  assert.equal(big.body.amount, 5_000_000_000);
  const t = big.body;
  assert.equal((await call('PATCH', `/transactions/${t.id}`, { kind: 'expense' })).status, 400, 'invest не расход');
  assert.equal((await call('PATCH', `/transactions/${t.id}`, { kind: 'expense', categoryId: 'other_out' })).status, 200);
  assert.equal((await call('DELETE', `/transactions/${t.id}`)).status, 200);
});

test('копилки: пополнение, снятие, запрет ухода в минус', async () => {
  const g = (await call('POST', '/savings', { title: 'Отпуск', target: 10_000_000, deadline: '2027-06-01' })).body;
  assert.equal(g.saved, 0);
  assert.equal((await call('POST', `/savings/${g.id}/moves`, { amount: 4_200_000, date: '2026-11-08' })).body.saved, 4_200_000);
  assert.equal((await call('POST', `/savings/${g.id}/moves`, { amount: -5_000_000, date: '2026-11-08' })).status, 400);
  assert.equal((await call('POST', `/savings/${g.id}/moves`, { amount: -200_000, date: '2026-11-08' })).body.saved, 4_000_000);
  assert.equal((await call('POST', `/savings/${g.id}/moves`, { amount: 0, date: '2026-11-08' })).status, 400);
  const moves = await call('GET', `/savings/${g.id}/moves`);
  assert.equal(moves.body.length, 2);
  const list = await call('GET', '/savings');
  assert.equal(list.body[0].saved, 4_000_000);
  const deposit = moves.body.find((m: { amount: number }) => m.amount > 0);
  assert.equal((await call('DELETE', `/savings/${g.id}/moves/${deposit.id}`)).status, 400, 'баланс уйдёт в минус');
});

// ── Спорт ──

test('тренировка: создание, правка подходов, завершение', async () => {
  const ex = await call('GET', '/exercises');
  assert.ok(ex.body.length > 20);
  const custom = (await call('POST', '/exercises', { title: 'Моё упражнение', group: 'arms' })).body;

  const w = await call('POST', '/workouts', {
    title: 'Грудь и трицепс',
    date: '2026-11-08',
    exercises: [
      { exerciseId: 'b:bench_press', sets: [{ reps: 10, weight: 60 }, { reps: 8, weight: 70 }] },
      { exerciseId: custom.id, sets: [{ reps: 12 }] },
      { exerciseId: 'b:plank', sets: [{ durationSec: 60 }] },
    ],
  });
  assert.equal(w.status, 201);
  assert.equal(w.body.exercises.length, 3);
  assert.equal(w.body.exercises[0].title, 'Жим штанги лёжа');
  assert.equal(w.body.exercises[2].unit, 'time');

  // Удаляем своё упражнение — в тренировке название сохраняется
  await call('DELETE', `/exercises/${custom.id}`);
  const upd = await call('PUT', `/workouts/${w.body.id}`, {
    title: 'Грудь и трицепс',
    date: '2026-11-08',
    exercises: [
      { exerciseId: 'b:bench_press', sets: [{ reps: 10, weight: 60, done: true }] },
      { exerciseId: custom.id, sets: [{ reps: 12, done: true }] },
    ],
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.exercises[1].title, 'Моё упражнение');
  assert.equal(upd.body.exercises[0].sets[0].done, true);

  const fin = await call('POST', `/workouts/${w.body.id}/finish`);
  assert.equal(fin.body.status, 'done');
  assert.ok(fin.body.finishedAt);

  const range = await call('GET', '/workouts?from=2026-11-02&to=2026-11-08');
  assert.equal(range.body.length, 1);

  assert.equal(
    (await call('POST', '/workouts', { title: 'x', date: '2026-11-08', exercises: [{ exerciseId: 'b:nope', sets: [] }] })).status,
    400,
  );
});

// ── Изоляция пользователей ──

test('чужие данные недоступны', async () => {
  const mine = (await call('POST', '/tasks', { title: 'Секрет Алисы' })).body;
  const goal = (await call('GET', '/savings')).body[0];
  const workouts = (await call('GET', '/workouts')).body;

  assert.equal((await call('GET', '/tasks', undefined, BOB)).body.length, 0);
  assert.equal((await call('PATCH', `/tasks/${mine.id}`, { title: 'взлом' }, BOB)).status, 404);
  assert.equal((await call('DELETE', `/tasks/${mine.id}`, undefined, BOB)).status, 404);
  assert.equal((await call('POST', `/savings/${goal.id}/moves`, { amount: -1, date: '2026-11-08' }, BOB)).status, 404);
  assert.equal((await call('GET', `/workouts/${workouts[0].id}`, undefined, BOB)).status, 404);
  assert.equal((await call('GET', '/transactions/summary', undefined, BOB)).body.income, 0);
});

// ── Напоминания (планировщик с поддельным Telegram) ──

test('планировщик: отправляет один раз, учитывает настройки и «Готово»', async () => {
  const { runReminders } = await import('../src/reminders/scheduler.js');
  const calls: { chat: string; text: string; kb: unknown }[] = [];
  const fakeApi = {
    sendMessage: async (chat: string, text: string, opts: { reply_markup?: unknown }) => {
      calls.push({ chat, text, kb: opts.reply_markup });
      return { message_id: calls.length };
    },
  } as never;

  // У Алисы часовой пояс Asia/Almaty (UTC+5): 10:00 местного = 05:00 UTC
  await call('PATCH', '/me', { settings: { notifications: { tasks: true, events: false, workouts: false } } });
  const t = (await call('POST', '/tasks', { title: 'Купить <хлеб>', date: '2026-11-20', time: '10:00', remind: 'ontime' })).body;
  await call('POST', '/tasks', { kind: 'event', title: 'Событие', date: '2026-11-20', time: '10:00', remind: 'ontime' });

  assert.equal(await runReminders(fakeApi, new Date('2026-11-20T04:59:00Z')), 0, 'рано');
  assert.equal(await runReminders(fakeApi, new Date('2026-11-20T05:00:30Z')), 1, 'событие выключено в настройках');
  assert.equal(calls[0].chat, '1001');
  assert.match(calls[0].text, /Купить &lt;хлеб&gt;/);
  assert.match(JSON.stringify(calls[0].kb), new RegExp(`done:${t.id}:2026-11-20`));
  assert.equal(await runReminders(fakeApi, new Date('2026-11-20T05:01:30Z')), 0, 'повторно не шлём');

  // Выполненная задача не напоминает
  const t2 = (await call('POST', '/tasks', { title: 'Уже сделано', date: '2026-11-20', time: '11:00', remind: 'ontime', status: 'done' })).body;
  assert.equal(await runReminders(fakeApi, new Date('2026-11-20T06:00:30Z')), 0);
  await call('DELETE', `/tasks/${t2.id}`);
  await call('PATCH', '/me', { settings: { notifications: { tasks: false } } });
});

// ── Обратная связь ──

test('обратная связь: сохраняется, проверяется', async () => {
  assert.equal((await call('POST', '/feedback', { kind: 'bug', text: 'Не открывается календарь' })).status, 201);
  assert.equal((await call('POST', '/feedback', { kind: 'idea', text: 'ок' })).status, 400, 'слишком коротко');
  assert.equal((await call('POST', '/feedback', { kind: 'spam', text: 'Привет всем' })).status, 400);
  const { prisma } = await import('../src/db.js');
  assert.equal(await prisma.feedback.count(), 1);
});

// ── Данные ──

test('экспорт и удаление всех данных', async () => {
  const exp = await app.inject({ method: 'GET', url: '/api/export', headers: { 'x-telegram-init-data': ALICE } });
  assert.equal(exp.statusCode, 200);
  const data = JSON.parse(exp.body);
  assert.ok(data.tasks.length > 0);
  assert.equal(typeof data.transactions[0].amount, 'number');

  assert.equal((await call('DELETE', '/data')).status, 200);
  assert.equal((await call('GET', '/tasks')).body.length, 0);
  assert.equal((await call('GET', '/transactions')).body.length, 0);
  assert.equal((await call('GET', '/me')).body.settings.currency, 'RUB', 'настройки сброшены');
});
