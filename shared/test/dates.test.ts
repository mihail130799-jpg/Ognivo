import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, endOfMonth, occursOn, startOfWeek, todayIn, weekday } from '../src/dates';

test('weekday: понедельник = 0, воскресенье = 6', () => {
  assert.equal(weekday('2026-11-02'), 0);
  assert.equal(weekday('2026-11-08'), 6);
});

test('addDays / startOfWeek / endOfMonth', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(startOfWeek('2026-11-08'), '2026-11-02');
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29');
});

test('occursOn: повторы', () => {
  assert.equal(occursOn('2026-11-08', 'none', '2026-11-08'), true);
  assert.equal(occursOn('2026-11-08', 'none', '2026-11-09'), false);
  assert.equal(occursOn('2026-11-08', 'day', '2026-11-07'), false, 'до начала — нет');
  assert.equal(occursOn('2026-11-08', 'day', '2027-01-01'), true);
  assert.equal(occursOn('2026-11-02', 'week', '2026-11-16'), true);
  assert.equal(occursOn('2026-11-02', 'week', '2026-11-17'), false);
  assert.equal(occursOn('2026-01-31', 'month', '2026-02-28'), true, '31-е → последний день февраля');
  assert.equal(occursOn('2026-01-31', 'month', '2026-03-31'), true);
  assert.equal(occursOn('2026-01-31', 'month', '2026-03-30'), false);
  assert.equal(occursOn(null, 'day', '2026-11-08'), false);
});

test('todayIn учитывает часовой пояс', () => {
  const now = new Date('2026-11-08T22:30:00Z');
  assert.equal(todayIn('Europe/London', now), '2026-11-08');
  assert.equal(todayIn('Europe/Moscow', now), '2026-11-09');
});
