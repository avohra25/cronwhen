#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { parse, describe, runs, CronSyntaxError } from '../src/index.js';

const USAGE = `Usage: cronwhen [options] "<cron expression>"

Explains a cron expression and lists when it will run.

Options:
  -n, --count <n>    how many run times to print (default 5)
  -f, --from <date>  start searching from this date/time (default now)
  -p, --prev         list previous runs instead of upcoming ones
  -u, --utc          interpret the expression in UTC instead of local time
  -j, --json         print machine-readable JSON
  -h, --help         show this help`;

function fail(message) {
  process.stderr.write(`cronwhen: ${message}\n`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      count: { type: 'string', short: 'n', default: '5' },
      from: { type: 'string', short: 'f' },
      prev: { type: 'boolean', short: 'p', default: false },
      utc: { type: 'boolean', short: 'u', default: false },
      json: { type: 'boolean', short: 'j', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (err) {
  fail(err.message);
}

const { values, positionals } = args;
if (values.help) {
  process.stdout.write(USAGE + '\n');
  process.exit(0);
}
// Accept both `cronwhen "0 9 * * *"` and the unquoted `cronwhen 0 9 '*' '*' '*'`.
const expression = positionals.join(' ');
if (!expression) fail('missing cron expression\n\n' + USAGE);

const count = Number(values.count);
if (!Number.isInteger(count) || count < 0) fail(`--count must be a non-negative integer, got "${values.count}"`);

const from = values.from ? new Date(values.from) : new Date();
if (Number.isNaN(from.getTime())) fail(`could not understand --from "${values.from}"`);

let cron;
try {
  cron = parse(expression);
} catch (err) {
  if (err instanceof CronSyntaxError) fail(err.message);
  throw err;
}

const times = runs(cron, count, { from, utc: values.utc, reverse: values.prev });
const format = (d) => (values.utc ? d.toISOString().replace('.000Z', 'Z') : d.toString().replace(/ \(.*\)$/, ''));

if (values.json) {
  process.stdout.write(
    JSON.stringify({ expression: cron.source, description: describe(cron), utc: values.utc, runs: times.map((d) => d.toISOString()) }, null, 2) + '\n',
  );
} else {
  const lines = [describe(cron)];
  if (count > 0) {
    lines.push('', values.prev ? 'Previous runs:' : 'Next runs:');
    if (times.length === 0) lines.push('  (none found in the search window)');
    for (const t of times) lines.push(`  ${format(t)}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}
