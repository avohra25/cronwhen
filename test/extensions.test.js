import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, nextRun, prevRun, runs, matches, describe, CronSyntaxError } from '../src/index.js';
import { daysInMonth, weekdayOf, nearestWeekday, lastWeekday } from '../src/calendar.js';

const utc = (iso) => ({ utc: true, from: iso });
const days = (expr, count, from) => runs(expr, count, utc(from)).map((d) => d.toISOString().slice(0, 10));

test('calendar helpers', () => {
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(weekdayOf(2026, 10, 31), 6);
  assert.equal(nearestWeekday(2026, 8, 15), 14); // Saturday -> Friday
  assert.equal(nearestWeekday(2026, 11, 15), 16); // Sunday -> Monday
  assert.equal(nearestWeekday(2026, 8, 1), 3); // Saturday the 1st -> Monday the 3rd
  assert.equal(nearestWeekday(2026, 5, 31), 29); // Sunday the 31st -> Friday the 29th
  assert.equal(nearestWeekday(2026, 4, 31), null); // April has no 31st
  assert.equal(lastWeekday(2026, 10), 30);
  assert.equal(lastWeekday(2027, 2), 26);
});

test('parses day-of-month rules alongside plain values', () => {
  const c = parse('0 0 1,L,L-2,15W,LW * *');
  assert.deepEqual([...c.dayOfMonth], [1]);
  assert.deepEqual(c.dayOfMonthRules, [
    { kind: 'last', offset: 0 },
    { kind: 'last', offset: 2 },
    { kind: 'nearestWeekday', day: 15 },
    { kind: 'lastWeekday' },
  ]);
  assert.equal(c.dayOfMonthRestricted, true);
  assert.deepEqual(parse('0 0 lw * *').dayOfMonthRules, [{ kind: 'lastWeekday' }]);
});

test('"?" in a day field means no specific value', () => {
  const c = parse('0 12 ? * MON');
  assert.equal(c.fields[2], '*');
  assert.equal(c.dayOfMonthRestricted, false);
  assert.equal(parse('0 12 1 * ?').dayOfWeekRestricted, false);
});

test('rejects malformed day-of-month rules', () => {
  const cases = [
    ['0 0 L-31 * *', /offset must be 0-30/],
    ['0 0 0W * *', /dayOfMonth: 0 is outside 1-31/],
    ['0 0 32W * *', /dayOfMonth: 32 is outside 1-31/],
    ['0 0 L/2 * *', /invalid value "L\/2"/],
    ['0 0 1-L * *', /invalid value/],
    ['0 0 W * *', /invalid value "W"/],
    ['? * * * *', /minute: invalid value "\?"/],
    ['0 0 * L *', /month: invalid value "L"/],
  ];
  for (const [expr, pattern] of cases) {
    assert.throws(() => parse(expr), (err) => err instanceof CronSyntaxError && pattern.test(err.message), expr);
  }
});

test('L fires on the last day of every month, including leap Februaries', () => {
  assert.deepEqual(days('0 0 L * *', 4, '2028-01-15T00:00:00Z'), ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  assert.deepEqual(days('0 0 L 2 *', 2, '2026-01-01T00:00:00Z'), ['2026-02-28', '2027-02-28']);
});

test('L-n counts back from the last day', () => {
  assert.deepEqual(days('0 0 L-2 * *', 3, '2027-01-01T00:00:00Z'), ['2027-01-29', '2027-02-26', '2027-03-29']);
  // L-30 only exists in 31-day months.
  assert.deepEqual(days('0 0 L-30 * *', 2, '2026-02-01T00:00:00Z'), ['2026-03-01', '2026-05-01']);
});

test('nW picks the nearest weekday inside the month', () => {
  assert.deepEqual(days('0 9 15W * *', 4, '2026-08-01T00:00:00Z'), ['2026-08-14', '2026-09-15', '2026-10-15', '2026-11-16']);
  assert.deepEqual(days('0 9 1W 8 *', 1, '2026-07-01T00:00:00Z'), ['2026-08-03']);
  assert.deepEqual(days('0 9 31W * *', 2, '2026-05-01T00:00:00Z'), ['2026-05-29', '2026-07-31']);
});

test('LW is the last weekday of the month', () => {
  assert.deepEqual(days('0 17 LW * *', 3, '2026-10-01T00:00:00Z'), ['2026-10-30', '2026-11-30', '2026-12-31']);
});

test('rules combine with day-of-week using the usual OR rule', () => {
  // The last day of the month, or any Monday.
  assert.deepEqual(days('0 0 L * MON', 3, '2026-10-26T12:00:00Z'), ['2026-10-31', '2026-11-02', '2026-11-09']);
  // "*" in day-of-week keeps the AND rule, so this is just the last day.
  assert.equal(matches('0 0 L * *', Date.UTC(2026, 9, 31), { utc: true }), true);
  assert.equal(matches('0 0 L * *', Date.UTC(2026, 9, 30), { utc: true }), false);
});

test('prevRun walks back across rule-based days', () => {
  assert.equal(prevRun('0 0 LW * *', utc('2026-11-01T00:00:00Z')).toISOString(), '2026-10-30T00:00:00.000Z');
  assert.equal(prevRun('0 0 L * *', utc('2028-03-01T00:00:00Z')).toISOString(), '2028-02-29T00:00:00.000Z');
});

test('rule schedules agree with matches() minute by minute', () => {
  const exprs = ['30 */8 L,15W * *', '0 0 LW,L-3 * *', '0 6 1W,L * 0'];
  for (const expr of exprs) {
    const cron = parse(expr);
    const start = Date.UTC(2026, 6, 1);
    const end = Date.UTC(2026, 9, 1);
    const all = [];
    for (let m = start + 60_000; m < end; m += 60_000) if (matches(cron, m, { utc: true })) all.push(m);
    const found = [];
    let t = nextRun(cron, { utc: true, from: start });
    while (t && t.getTime() < end) {
      found.push(t.getTime());
      t = nextRun(cron, { utc: true, from: t });
    }
    assert.deepEqual(found, all, expr);
    assert.ok(all.length > 0, expr);
  }
});

test('describe() explains day-of-month rules', () => {
  assert.equal(describe('0 0 L * *'), 'At 00:00, on the last day of the month');
  assert.equal(describe('0 0 L-3 * *'), 'At 00:00, on the 4th-to-last day of the month');
  assert.equal(describe('0 0 L-1 * *'), 'At 00:00, on the 2nd-to-last day of the month');
  assert.equal(describe('0 17 LW * *'), 'At 17:00, on the last weekday of the month');
  assert.equal(describe('0 9 15W * *'), 'At 09:00, on the weekday nearest the 15th of the month');
  assert.equal(describe('0 0 1,15,L * *'), 'At 00:00, on the 1st and 15th and the last day of the month');
  assert.equal(describe('0 0 L * FRI'), 'At 00:00, on the last day of the month or on Friday');
  assert.equal(describe('0 12 ? * MON'), 'At 12:00, on Monday');
});
