import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun, prevRun, runs, matches, parse } from '../src/index.js';

const utc = (iso) => ({ utc: true, from: iso });
const iso = (d) => d && d.toISOString();

test('next run is strictly after the start time', () => {
  assert.equal(iso(nextRun('* * * * *', utc('2026-01-01T00:00:00Z'))), '2026-01-01T00:01:00.000Z');
  assert.equal(iso(nextRun('* * * * *', utc('2026-01-01T00:00:30Z'))), '2026-01-01T00:01:00.000Z');
});

test('weekday business hours', () => {
  // 2026-10-16 is a Friday.
  const r = runs('30 9 * * MON-FRI', 3, utc('2026-10-16T10:00:00Z')).map(iso);
  assert.deepEqual(r, ['2026-10-19T09:30:00.000Z', '2026-10-20T09:30:00.000Z', '2026-10-21T09:30:00.000Z']);
});

test('every 15 minutes rolls over hours and days', () => {
  const r = runs('*/15 * * * *', 3, utc('2026-12-31T23:40:00Z')).map(iso);
  assert.deepEqual(r, ['2026-12-31T23:45:00.000Z', '2027-01-01T00:00:00.000Z', '2027-01-01T00:15:00.000Z']);
});

test('day-of-month and day-of-week are ORed when both are restricted', () => {
  // The 13th, or any Friday.
  const r = runs('0 0 13 * FRI', 4, utc('2026-11-01T00:00:00Z')).map(iso);
  assert.deepEqual(r, [
    '2026-11-06T00:00:00.000Z',
    '2026-11-13T00:00:00.000Z',
    '2026-11-20T00:00:00.000Z',
    '2026-11-27T00:00:00.000Z',
  ]);
  const dec = runs('0 0 13 * FRI', 2, utc('2026-12-01T00:00:00Z')).map(iso);
  assert.deepEqual(dec, ['2026-12-04T00:00:00.000Z', '2026-12-11T00:00:00.000Z']);
  assert.equal(iso(nextRun('0 0 13 * FRI', utc('2026-12-11T00:00:00Z'))), '2026-12-13T00:00:00.000Z');
});

test('day fields are ANDed when one starts with "*"', () => {
  // Odd days that are also Mondays.
  const r = runs('0 12 */2 * 1', 2, utc('2026-10-01T00:00:00Z')).map(iso);
  assert.deepEqual(r, ['2026-10-05T12:00:00.000Z', '2026-10-19T12:00:00.000Z']);
});

test('leap day schedules skip ahead years', () => {
  assert.equal(iso(nextRun('0 0 29 2 *', utc('2026-03-01T00:00:00Z'))), '2028-02-29T00:00:00.000Z');
});

test('impossible dates return null instead of looping forever', () => {
  assert.equal(nextRun('0 0 30 2 *', utc('2026-01-01T00:00:00Z')), null);
  assert.equal(prevRun('0 0 31 4 *', utc('2026-01-01T00:00:00Z')), null);
});

test('previous run is strictly before the start time', () => {
  assert.equal(iso(prevRun('0 9 * * *', utc('2026-10-16T09:00:00Z'))), '2026-10-15T09:00:00.000Z');
  assert.equal(iso(prevRun('0 9 * * *', utc('2026-10-16T09:00:01Z'))), '2026-10-16T09:00:00.000Z');
  assert.equal(iso(prevRun('@monthly', utc('2026-03-15T00:00:00Z'))), '2026-03-01T00:00:00.000Z');
  assert.equal(iso(prevRun('59 23 31 12 *', utc('2026-06-01T00:00:00Z'))), '2025-12-31T23:59:00.000Z');
});

test('reverse runs walk backwards', () => {
  const r = runs('0 */6 * * *', 3, { ...utc('2026-10-16T13:00:00Z'), reverse: true }).map(iso);
  assert.deepEqual(r, ['2026-10-16T12:00:00.000Z', '2026-10-16T06:00:00.000Z', '2026-10-16T00:00:00.000Z']);
});

test('next and prev agree with matches() over a brute-force window', () => {
  const exprs = ['7,37 */5 * * *', '0 0 1,15 * 3', '*/20 8-10 * JAN,JUL 1-5', '15 2 1 * *'];
  for (const expr of exprs) {
    const cron = parse(expr);
    const t = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2026, 1, 15);
    let expected = null;
    for (let m = t + 60_000; m <= end; m += 60_000) {
      if (matches(cron, m, { utc: true })) { expected = m; break; }
    }
    assert.equal(nextRun(cron, { utc: true, from: t })?.getTime() ?? null, expected, expr);

    let expectedPrev = null;
    for (let m = end - 60_000; m >= t; m -= 60_000) {
      if (matches(cron, m, { utc: true })) { expectedPrev = m; break; }
    }
    assert.equal(prevRun(cron, { utc: true, from: end })?.getTime() ?? null, expectedPrev, expr);
  }
});

test('local-time mode uses the host zone', () => {
  const from = new Date(2026, 4, 10, 8, 59);
  const next = nextRun('0 9 * * *', { from });
  assert.equal(next.getHours(), 9);
  assert.equal(next.getDate(), 10);
});

test('argument validation', () => {
  assert.throws(() => runs('* * * * *', -1), RangeError);
  assert.throws(() => nextRun('* * * * *', { from: 'not a date' }), TypeError);
});
