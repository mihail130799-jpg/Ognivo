import { CURRENCY_SYMBOL, type Currency, type DateStr } from '@ognivo/shared';

/** Копейки → «1 234 ₽» (копейки показываем, только если они есть). */
export function money(minor: number, currency: Currency, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(minor) / 100;
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const num = abs.toLocaleString('ru-RU', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const sign = minor < 0 ? '− ' : opts.sign && minor > 0 ? '+ ' : '';
  return `${sign}${num} ${CURRENCY_SYMBOL[currency]}`;
}

/** Строка ввода «1 234,50» → копейки. null — если ввод некорректен или ≤ 0. */
export function parseAmount(input: string): number | null {
  const clean = input.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const minor = Math.round(Number(clean) * 100);
  return minor > 0 ? minor : null;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

function parts(d: DateStr) {
  return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, day: Number(d.slice(8, 10)) };
}

function wd(d: DateStr): number {
  return (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const dayNum = (d: DateStr) => parts(d).day;
export const monthShort = (d: DateStr) => MONTHS_SHORT[parts(d).m];
export const monthName = (d: DateStr) => MONTHS_NOM[parts(d).m];
export const weekdayLong = (d: DateStr) => WEEKDAYS_LONG[wd(d)];
export const weekdayShort = (d: DateStr) => WEEKDAYS_SHORT[wd(d)];

/** «8 ноября» */
export function dayMonth(d: DateStr): string {
  const p = parts(d);
  return `${p.day} ${MONTHS_GEN[p.m]}`;
}

/** «Сегодня», «Завтра», «Вчера» или «четверг, 12 ноября» */
export function relativeDay(d: DateStr, today: DateStr): string {
  const diff = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const year = parts(d).y !== parts(today).y ? ` ${parts(d).y}` : '';
  return `${weekdayLong(d)}, ${dayMonth(d)}${year}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Склонение: plural(5, ['задача', 'задачи', 'задач']) → «задач» */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Копейки → строка для поля ввода: 125050 → «1250,50», 100000 → «1000». */
export function amountToInput(minor: number): string {
  return minor % 100 ? (minor / 100).toFixed(2).replace('.', ',') : String(minor / 100);
}
