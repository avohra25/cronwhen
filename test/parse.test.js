import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, CronSyntaxError } from '../src/parse.js';

const sorted = (set) => [...set].sort((a, b) => a - b);

test('wildcards cover the whole field', () => {
  const c = parse('* * * * *');
  assert.equal(c.minute.size, 60);
  assert.equal(c.hour.size, 24);
  assert.deepEqual(sorted(c.dayOfWeek), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(c.dayOfMonthRestricted, false);
});

test('lists, ranges and steps', () => {
  const c = parse('0,30 9-17/4 1-10/3 */6 *');
  assert.deepEqual(sorted(c.minute), [0, 30]);
  assert.deepEqual(sorted(c.hour), [9, 13, 17]);
  assert.deepEqual(sorted(c.dayOfMonth), [1, 4, 7, 10]);
  assert.deepEqual(sorted(c.month), [1, 7]);
});

test('start/step runs to the field maximum', () => {
  assert.deepEqual(sorted(parse('5/20 * * * *').minute), [5, 25, 45]);
});

test('month and weekday names are case-insensitive', () => {
  const c = parse('0 0 * jan-Mar MON-fri');
  assert.deepEqual(sorted(c.month), [1, 2, 3]);
  assert.deepEqual(sorted(c.dayOfWeek), [1, 2, 3, 4, 5]);
});

test('7 is Sunday', () => {
  assert.deepEqual(sorted(parse('0 0 * * 5-7').dayOfWeek), [0, 5, 6]);
});

test('macros expand', () => {
  const c = parse('@weekly');
  assert.deepEqual(c.fields, ['0', '0', '*', '*', '0']);
  assert.deepEqual(parse('@HOURLY').fields, ['0', '*', '*', '*', '*']);
});

test('day restriction flags follow the leading "*" rule', () => {
  const c = parse('0 0 */2 * 1');
  assert.equal(c.dayOfMonthRestricted, false);
  assert.equal(c.dayOfWeekRestricted, true);
});

test('rejects malformed expressions with field names', () => {
  const cases = [
    ['* * * *', /expected 5 fields/],
    ['60 * * * *', /minute: 60 is outside 0-59/],
    ['* 24 * * *', /hour/],
    ['* * 0 * *', /dayOfMonth/],
    ['* * * 13 *', /month/],
    ['* * * * 8', /dayOfWeek/],
    ['*/0 * * * *', /invalid step/],
    ['5-1 * * * *', /backwards/],
    ['1,,2 * * * *', /empty list item/],
    ['a * * * *', /invalid value "a"/],
    ['@fortnightly', /unknown macro/],
  ];
  for (const [expr, pattern] of cases) {
    assert.throws(() => parse(expr), (err) => err instanceof CronSyntaxError && pattern.test(err.message), expr);
  }
});
