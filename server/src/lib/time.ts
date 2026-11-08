// Перевод «дата + время в часовом поясе пользователя» → момент времени UTC без сторонних библиотек.

/** Смещение часового пояса tz относительно UTC (мс) в момент at. */
export function tzOffsetMs(tz: string, at: Date): number {
  const t = Math.floor(at.getTime() / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - t;
}

/** Момент UTC, соответствующий местным date ('YYYY-MM-DD') и time ('HH:MM') в поясе tz. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMs(tz, new Date(guess));
  let utc = guess - off1;
  // Повторная поправка на случай перехода на летнее/зимнее время между guess и ответом
  const off2 = tzOffsetMs(tz, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}
