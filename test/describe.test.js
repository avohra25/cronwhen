import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe } from '../src/index.js';

const cases = [
  ['* * * * *', 'Every minute'],
  ['*/5 * * * *', 'Every 5 minutes'],
  ['0 * * * *', 'At minute 0 past every hour'],
  ['15,45 * * * *', 'At minutes 15 and 45 past every hour'],
  ['30 9 * * MON-FRI', 'At 09:30, on Monday through Friday'],
  ['0 9,17 * * *', 'At 09:00 and 17:00'],
  ['0 */6 * * *', 'At minute 0 past every 6 hours'],
  ['*/10 9-17 * * 1-5', 'Every 10 minutes during 09:00 through 17:00, on Monday through Friday'],
  ['0 0 1 * *', 'At 00:00, on the 1st of the month'],
  ['0 0 1,15 * *', 'At 00:00, on the 1st and 15th of the month'],
  ['0 0 13 * FRI', 'At 00:00, on the 13th or on Friday'],
  ['0 0 1 1 *', 'At 00:00, on the 1st of the month, in January'],
  ['0 12 * JUN-AUG SAT,SUN', 'At 12:00, on Sunday and Saturday, in June through August'],
  ['0 0 */2 * *', 'At 00:00, every 2 days'],
  ['0 0 1 */3 *', 'At 00:00, on the 1st of the month, every 3 months'],
  ['5 4 22 * *', 'At 04:05, on the 22nd of the month'],
  ['0 0 11,12,13 * *', 'At 00:00, on the 11th through 13th of the month'],
  ['@weekly', 'At 00:00, on Sunday'],
];

for (const [expr, expected] of cases) {
  test(`describe("${expr}")`, () => assert.equal(describe(expr), expected));
}

test('dense schedules fall back to a compact summary', () => {
  assert.equal(describe('0,20,40 8-12 * * *'), 'At minutes 0, 20 and 40 past 08:00 through 12:00');
});
