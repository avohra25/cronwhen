import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/cronwhen.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

test('prints a description and upcoming runs', () => {
  const r = run('--utc', '--from', '2026-10-16T10:00:00Z', '-n', '2', '30 9 * * MON-FRI');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'At 09:30, on Monday through Friday\n\nNext runs:\n  2026-10-19T09:30:00Z\n  2026-10-20T09:30:00Z\n');
});

test('accepts an unquoted expression split across arguments', () => {
  const r = run('-u', '-f', '2026-01-01T00:00:00Z', '-n', '1', '0', '12', '*', '*', '*');
  assert.match(r.stdout, /2026-01-01T12:00:00Z/);
});

test('--prev and --json', () => {
  const r = run('-u', '-p', '-j', '-f', '2026-10-16T00:00:00Z', '-n', '2', '@daily');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.description, 'At 00:00');
  assert.deepEqual(out.runs, ['2026-10-15T00:00:00.000Z', '2026-10-14T00:00:00.000Z']);
});

test('reports syntax errors with exit code 2', () => {
  const r = run('61 * * * *');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /minute: 61 is outside 0-59/);
});

test('rejects bad options', () => {
  assert.equal(run('-n', 'lots', '* * * * *').status, 2);
  assert.equal(run('--from', 'someday', '* * * * *').status, 2);
  assert.equal(run().status, 2);
});

test('--help', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: cronwhen/);
});
