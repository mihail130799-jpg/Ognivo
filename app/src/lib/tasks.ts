import { addDays, occursOn, type DateStr, type TaskDto } from '@ognivo/shared';

/** Выполнена ли задача в конкретный день (для повторяющихся — отметка на дату). */
export function isDoneOn(t: TaskDto, date: DateStr): boolean {
  return t.repeat === 'none' ? t.status === 'done' : t.doneDates.includes(date);
}

/** Просрочена: обычная задача с прошедшей датой, не выполнена. */
export function isOverdue(t: TaskDto, today: DateStr): boolean {
  return t.kind === 'task' && t.repeat === 'none' && !!t.date && t.date < today && t.status !== 'done';
}

export interface Occurrence {
  task: TaskDto;
  date: DateStr;
}

/** Все вхождения задач/событий в диапазоне дат (повторы раскрываются). */
export function occurrences(tasks: TaskDto[], from: DateStr, to: DateStr): Occurrence[] {
  const out: Occurrence[] = [];
  for (const t of tasks) {
    if (!t.date) continue;
    if (t.repeat === 'none') {
      if (t.date >= from && t.date <= to) out.push({ task: t, date: t.date });
      continue;
    }
    for (let d = from > t.date ? from : t.date; d <= to; d = addDays(d, 1)) {
      if (occursOn(t.date, t.repeat, d)) out.push({ task: t, date: d });
    }
  }
  return out.sort(byDateTime);
}

function byDateTime(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.task.time ?? '99:99').localeCompare(b.task.time ?? '99:99');
}

/** Задачи на день для «Плана на день»: просроченные + на сегодня; выполненные — в конце. */
export function tasksForDay(tasks: TaskDto[], day: DateStr, today: DateStr): Occurrence[] {
  const list = occurrences(
    tasks.filter((t) => t.kind === 'task'),
    day,
    day,
  );
  const overdue =
    day === today
      ? tasks.filter((t) => isOverdue(t, today)).map((t) => ({ task: t, date: t.date! }))
      : [];
  return [...overdue, ...list].sort((a, b) => Number(isDoneOn(a.task, a.date)) - Number(isDoneOn(b.task, b.date)));
}
