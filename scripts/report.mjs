// Понятная сводка по копии базы Ognivo: что записал каждый пользователь.
// Только чтение. Запуск на ПК:
//   node scripts/report.mjs [путь к .db] [путь к .html]
// По умолчанию: secrets/ognivo-view.db → secrets/report.html (папка secrets не попадает в git).
// Скачать свежую копию и пересобрать одной командой: npm run report
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_BY_ID } from '../shared/src/categories.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.argv[2] ?? path.join(root, 'secrets', 'ognivo-view.db');
const outPath = process.argv[3] ?? path.join(root, 'secrets', 'report.html');

const db = new DatabaseSync(dbPath, { readOnly: true });
const all = (sql, ...p) => db.prepare(sql).all(...p);

// ── форматирование ──
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SYMBOL = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸', VND: '₫' };
const money = (kop, cur = 'RUB') =>
  `${(Number(kop) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${SYMBOL[cur] ?? cur}`;
// Prisma хранит DateTime в SQLite числом (мс) или строкой — понимаем оба
const toDate = (v) => (v == null ? null : new Date(typeof v === 'number' || /^\d+$/.test(v) ? Number(v) : v));
const dt = (v, tz) =>
  toDate(v)?.toLocaleString('ru-RU', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? '—';
const day = (s) => {
  if (!s) return 'без даты';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
};
const REPEAT = { none: '', daily: 'каждый день', weekdays: 'по будням', weekly: 'каждую неделю', monthly: 'каждый месяц', yearly: 'каждый год' };
const REMIND = { none: '', ontime: 'в момент', '15m': 'за 15 мин', '1h': 'за час', '1d': 'за день' };
const TASK_STATUS = { planned: 'запланировано', done: 'выполнено ✓', cancelled: 'отменено' };
const WORKOUT_STATUS = { planned: 'запланирована', done: 'выполнена ✓' };

function table(head, rows) {
  if (!rows.length) return '<p class="empty">Пока ничего не записано.</p>';
  return `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}
const section = (title, count, body) =>
  `<section><h3>${title} <span class="count">${count}</span></h3>${body}</section>`;

// ── сбор данных по пользователю ──
function userBlock(u) {
  let settings = {};
  try {
    settings = JSON.parse(u.settings || '{}');
  } catch {}
  const cur = settings.currency ?? 'RUB';
  const tz = u.timezone || 'Europe/Moscow';

  const tasks = all(
    `SELECT t.*, (SELECT COUNT(*) FROM TaskCompletion c WHERE c.taskId = t.id) AS completions
     FROM Task t WHERE userId = ? ORDER BY date IS NULL, date, time`,
    u.id,
  );
  const habits = all(
    `SELECT h.*, COUNT(c.id) AS checks, MAX(c.date) AS lastCheck
     FROM Habit h LEFT JOIN HabitCheck c ON c.habitId = h.id WHERE userId = ? GROUP BY h.id ORDER BY h.sortOrder`,
    u.id,
  );
  const txs = all(`SELECT * FROM "Transaction" WHERE userId = ? ORDER BY date DESC, createdAt DESC`, u.id);
  const goals = all(
    `SELECT g.*, COALESCE(SUM(m.amount), 0) AS saved, COUNT(m.id) AS moves
     FROM SavingsGoal g LEFT JOIN SavingsMove m ON m.goalId = g.id WHERE userId = ? GROUP BY g.id ORDER BY g.createdAt`,
    u.id,
  );
  const workouts = all(
    `SELECT w.*,
       (SELECT COUNT(*) FROM WorkoutExercise e WHERE e.workoutId = w.id) AS exercises,
       (SELECT COUNT(*) FROM WorkoutSet s JOIN WorkoutExercise e ON s.workoutExerciseId = e.id WHERE e.workoutId = w.id) AS sets,
       (SELECT COUNT(*) FROM WorkoutSet s JOIN WorkoutExercise e ON s.workoutExerciseId = e.id WHERE e.workoutId = w.id AND s.done) AS setsDone,
       (SELECT GROUP_CONCAT(e.title, ', ') FROM WorkoutExercise e WHERE e.workoutId = w.id) AS exList
     FROM Workout w WHERE userId = ? ORDER BY date DESC`,
    u.id,
  );
  const exercises = all(`SELECT * FROM Exercise WHERE userId = ? ORDER BY title`, u.id);
  const feedback = all(`SELECT * FROM Feedback WHERE userId = ? ORDER BY createdAt DESC`, u.id);

  // Последняя активность — самая поздняя дата создания/изменения среди всех записей
  const stamps = [u.updatedAt, ...tasks.map((t) => t.updatedAt), ...txs.map((t) => t.createdAt), ...goals.map((g) => g.createdAt), ...workouts.map((w) => w.updatedAt), ...habits.map((h) => h.createdAt)]
    .map(toDate)
    .filter(Boolean);
  const last = stamps.length ? new Date(Math.max(...stamps)) : null;

  const taskList = tasks.filter((t) => t.kind !== 'event');
  const events = tasks.filter((t) => t.kind === 'event');
  const taskRow = (t) => [
    esc(t.title) + (t.comment ? `<div class="sub">${esc(t.comment)}</div>` : ''),
    day(t.date) + (t.time ? `, ${t.time}` : ''),
    [REPEAT[t.repeat] ?? t.repeat, REMIND[t.remind] ? `🔔 ${REMIND[t.remind]}` : ''].filter(Boolean).join(' · ') || '—',
    t.repeat !== 'none' ? `отмечено ${t.completions} раз` : (TASK_STATUS[t.status] ?? t.status),
  ];

  const income = txs.filter((t) => t.kind === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter((t) => t.kind === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const byCat = {};
  for (const t of txs) {
    const k = `${t.kind}:${t.categoryId}`;
    byCat[k] = (byCat[k] ?? 0) + Number(t.amount);
  }
  const cat = (id) => {
    const c = CATEGORY_BY_ID[id];
    return c ? `${c.emoji} ${c.title}` : esc(id);
  };

  const counts = [
    ['Задачи', taskList.length],
    ['События', events.length],
    ['Привычки', habits.length],
    ['Операции', txs.length],
    ['Копилки', goals.length],
    ['Тренировки', workouts.length],
  ];

  return `
<article class="user">
  <header>
    <h2>${esc(u.name)} ${u.username ? `<span class="muted">@${esc(u.username)}</span>` : ''}</h2>
    <p class="muted">Telegram ID ${esc(u.telegramId)} · первый вход ${dt(u.createdAt, tz)} · последняя активность ${last ? dt(last.getTime(), tz) : '—'} · пояс ${esc(tz)} · валюта ${esc(cur)}</p>
    <div class="stats">${counts.map(([n, c]) => `<div class="stat${c ? '' : ' zero'}"><b>${c}</b><span>${n}</span></div>`).join('')}</div>
  </header>

  ${section('Задачи', taskList.length, table(['Что', 'Когда', 'Повтор и напоминание', 'Статус'], taskList.map(taskRow)))}
  ${section('События', events.length, table(['Что', 'Когда', 'Повтор и напоминание', 'Статус'], events.map(taskRow)))}
  ${section(
    'Привычки',
    habits.length,
    table(
      ['Привычка', 'Отмечена дней', 'Последний раз', ''],
      habits.map((h) => [`${esc(h.emoji)} ${esc(h.title)}`, h.checks, h.lastCheck ? day(h.lastCheck) : '—', h.archived ? 'в архиве' : '']),
    ),
  )}
  ${section(
    'Деньги',
    txs.length,
    txs.length
      ? `<p class="totals"><span class="inc">Доходы ${money(income, cur)}</span> · <span class="exp">Расходы ${money(expense, cur)}</span> · Итого <b>${money(income - expense, cur)}</b></p>
         <h4>По категориям</h4>
         ${table(
           ['Категория', 'Тип', 'Сумма'],
           Object.entries(byCat)
             .sort((a, b) => b[1] - a[1])
             .map(([k, v]) => {
               const [kind, id] = k.split(':');
               return [cat(id), kind === 'income' ? 'доход' : 'расход', money(v, cur)];
             }),
         )}
         <h4>Все операции</h4>
         ${table(
           ['Дата', 'Категория', 'Сумма', 'Комментарий'],
           txs.map((t) => [
             day(t.date),
             cat(t.categoryId),
             `<span class="${t.kind === 'income' ? 'inc' : 'exp'}">${t.kind === 'income' ? '+' : '−'}${money(t.amount, cur)}</span>`,
             esc(t.comment) || '—',
           ]),
         )}`
      : table([], []),
  )}
  ${section(
    'Копилки',
    goals.length,
    table(
      ['Цель', 'Накоплено', 'Нужно', 'Прогресс', 'Срок'],
      goals.map((g) => {
        const pct = g.target > 0 ? Math.floor((Number(g.saved) / Number(g.target)) * 100) : 0;
        return [
          `${esc(g.emoji)} ${esc(g.title)}${g.archived ? ' <span class="sub">(в архиве)</span>' : ''}`,
          `${money(g.saved, cur)}<div class="sub">${g.moves} пополнений/снятий</div>`,
          money(g.target, cur),
          `<div class="bar"><i style="width:${Math.min(pct, 100)}%"></i></div>${pct}%`,
          g.deadline ? day(g.deadline) : '—',
        ];
      }),
    ),
  )}
  ${section(
    'Тренировки',
    workouts.length,
    table(
      ['Дата', 'Тренировка', 'Упражнения', 'Подходы', 'Статус'],
      workouts.map((w) => [
        day(w.date),
        esc(w.title) + (w.note ? `<div class="sub">${esc(w.note)}</div>` : ''),
        esc(w.exList) || '—',
        `${w.setsDone} из ${w.sets}`,
        WORKOUT_STATUS[w.status] ?? w.status,
      ]),
    ),
  )}
  ${exercises.length ? section('Свои упражнения', exercises.length, table(['Упражнение'], exercises.map((e) => [esc(e.title)]))) : ''}
  ${feedback.length ? section('Обратная связь', feedback.length, table(['Когда', 'Тип', 'Текст'], feedback.map((f) => [dt(f.createdAt, tz), f.kind === 'bug' ? 'баг' : 'идея', esc(f.text)]))) : ''}
</article>`;
}

const users = all(`SELECT * FROM User ORDER BY createdAt`);
const generated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ognivo — сводка</title>
<style>
:root{--bg:#16130f;--card:#211c17;--line:#332b23;--text:#f1e9df;--muted:#a3968a;--accent:#f08a3c;--inc:#7fc79a;--exp:#ef8a7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px 16px 60px}
main{max-width:980px;margin:0 auto}h1{margin:0 0 4px;font-size:26px}h1 span{color:var(--accent)}
.muted,.sub{color:var(--muted)}.sub{font-size:12px;margin-top:2px}
.user{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-top:22px}
.user h2{margin:0 0 4px;font-size:21px}.user header p{margin:0 0 14px;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.stat{background:var(--bg);border-radius:12px;padding:10px 12px}.stat b{display:block;font-size:22px;color:var(--accent)}
.stat span{font-size:12px;color:var(--muted)}.stat.zero b{color:var(--muted)}
section{margin-top:22px}h3{margin:0 0 8px;font-size:16px}h4{margin:14px 0 6px;font-size:13px;color:var(--muted);font-weight:600}
.count{display:inline-block;min-width:22px;padding:0 7px;border-radius:10px;background:var(--bg);color:var(--muted);font-size:12px;text-align:center}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
.empty{color:var(--muted);margin:0;font-size:14px}.inc{color:var(--inc)}.exp{color:var(--exp)}.totals{margin:0}
.bar{height:6px;background:var(--bg);border-radius:3px;overflow:hidden;margin-bottom:4px;min-width:80px}.bar i{display:block;height:100%;background:var(--accent)}
</style></head><body><main>
<h1>Ognivo <span>·</span> сводка</h1>
<p class="muted">Снимок базы ${esc(path.basename(dbPath))} · собрано ${generated} (МСК) · пользователей: ${users.length}</p>
${users.map(userBlock).join('\n')}
</main></body></html>`;

writeFileSync(outPath, html);
console.log(`Готово: ${outPath} (пользователей: ${users.length})`);
