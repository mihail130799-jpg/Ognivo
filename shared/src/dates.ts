// Работа с датами дней в формате 'YYYY-MM-DD'. Все вычисления — в UTC,
// чтобы не зависеть от часового пояса машины; «сегодня» для пользователя
// считается через todayIn(timezone).

export type DateStr = string;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toUtc(d: DateStr): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromUtc(dt: Date): DateStr {
  return dt.toISOString().slice(0, 10);
}

/** Сегодняшняя дата в указанном часовом поясе. */
export function todayIn(timezone: string, now: Date = new Date()): DateStr {
  // Локаль en-CA форматирует как YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(d: DateStr, n: number): DateStr {
  const dt = toUtc(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/** День недели: 0 — понедельник … 6 — воскресенье. */
export function weekday(d: DateStr): number {
  return (toUtc(d).getUTCDay() + 6) % 7;
}

/** Понедельник недели, в которую входит дата. */
export function startOfWeek(d: DateStr): DateStr {
  return addDays(d, -weekday(d));
}

export function startOfMonth(d: DateStr): DateStr {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: DateStr): DateStr {
  const dt = toUtc(startOfMonth(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  dt.setUTCDate(0);
  return fromUtc(dt);
}

export function daysInMonth(d: DateStr): number {
  return Number(endOfMonth(d).slice(8, 10));
}

export type Repeat = 'none' | 'day' | 'week' | 'month';

/**
 * Приходится ли задача с датой start и повтором repeat на день d.
 * Ежемесячный повтор на 31-е число в коротких месяцах переносится на последний день месяца.
 */
export function occursOn(start: DateStr | null, repeat: Repeat, d: DateStr): boolean {
  if (!start) return false;
  if (d < start) return false;
  switch (repeat) {
    case 'none':
      return d === start;
    case 'day':
      return true;
    case 'week':
      return weekday(d) === weekday(start);
    case 'month': {
      const startDay = Number(start.slice(8, 10));
      const day = Number(d.slice(8, 10));
      return day === Math.min(startDay, daysInMonth(d));
    }
  }
}
