# cronwhen

A small, zero-dependency cron toolkit for Node.js. It parses classic five-field
crontab expressions, tells you exactly when they will (or did) fire, and
explains them in plain English. It ships as a library and as a CLI.

```console
$ cronwhen -n 3 "30 9 * * MON-FRI"
At 09:30, on Monday through Friday

Next runs:
  Mon Oct 19 2026 09:30:00 GMT-0700
  Tue Oct 20 2026 09:30:00 GMT-0700
  Wed Oct 21 2026 09:30:00 GMT-0700
```

## Features

- Full five-field syntax: `*`, lists (`1,15`), ranges (`9-17`), steps (`*/15`,
  `9-17/2`, `5/20`), month and weekday names (`JAN`, `mon-fri`), and `7` as Sunday.
- Macros: `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`.
- Next and previous run times, in UTC or the host's local time zone.
- Vixie cron day semantics: when both day-of-month and day-of-week are
  restricted, a day matches if **either** does (`0 0 13 * FRI` is "the 13th or
  any Friday").
- Impossible schedules such as `0 0 30 2 *` return `null` instead of hanging.
- Clear errors that name the offending field (`minute: 61 is outside 0-59`).
- No dependencies; tests use the built-in `node:test` runner.

## Install

Requires Node.js 18 or newer.

```sh
git clone https://github.com/avohra25/cronwhen.git
cd cronwhen
npm test
npm link        # optional: puts `cronwhen` on your PATH
```

## CLI

```text
Usage: cronwhen [options] "<cron expression>"

Options:
  -n, --count <n>    how many run times to print (default 5)
  -f, --from <date>  start searching from this date/time (default now)
  -p, --prev         list previous runs instead of upcoming ones
  -u, --utc          interpret the expression in UTC instead of local time
  -j, --json         print machine-readable JSON
  -h, --help         show this help
```

```console
$ cronwhen --utc --prev --json -n 2 --from 2026-10-16T00:00:00Z @daily
{
  "expression": "@daily",
  "description": "At 00:00",
  "utc": true,
  "runs": [
    "2026-10-15T00:00:00.000Z",
    "2026-10-14T00:00:00.000Z"
  ]
}
```

Invalid input exits with status 2 and a message on stderr.

## Library

```js
import { parse, nextRun, prevRun, runs, matches, describe } from 'cronwhen';

describe('*/10 9-17 * * 1-5');
// 'Every 10 minutes during 09:00 through 17:00, on Monday through Friday'

nextRun('0 0 29 2 *', { utc: true, from: '2026-03-01T00:00:00Z' });
// 2028-02-29T00:00:00.000Z

runs('0 */6 * * *', 3, { utc: true, from: '2026-10-16T13:00:00Z', reverse: true });
// [12:00, 06:00, 00:00 on 2026-10-16]

matches('30 9 * * MON-FRI', new Date('2026-10-16T09:30:00Z'), { utc: true }); // true
```

| Function | Returns |
|---|---|
| `parse(expr)` | Sets of allowed values per field, plus the raw fields. Throws `CronSyntaxError`. |
| `nextRun(expr, opts)` | First matching `Date` strictly after `opts.from`, or `null`. |
| `prevRun(expr, opts)` | Last matching `Date` strictly before `opts.from`, or `null`. |
| `runs(expr, count, opts)` | Up to `count` dates; set `opts.reverse` to walk backwards. |
| `matches(expr, date, opts)` | Whether `date` falls in a firing minute. |
| `describe(expr)` | An English sentence describing the schedule. |

Every function accepts either a string or the object returned by `parse()`, so
you can parse once and reuse it. Options: `from` (anything `new Date()`
accepts, default now), `utc` (default `false`), and `maxYears` (search window,
default 8 years, long enough to find leap-day schedules).

## How the search works

Rather than testing every minute, the search checks fields from coarsest to
finest. If the month can't match it jumps to the next month boundary; if the day
can't match it jumps to the next midnight; then the next hour; and only then
does it step minute by minute. Each jump lands on a boundary, so even sparse
schedules resolve in a few hundred iterations. Searching backwards uses the
same steps, landing on the last minute of the previous month, day, or hour.
Because jumps are built with the platform `Date` constructor, local-time mode
follows the host's daylight-saving rules: a time skipped by a spring-forward
change never fires, and a repeated hour in the fall fires once.

A brute-force test cross-checks `nextRun` and `prevRun` against `matches()`
minute by minute over a six-week window.

## Not supported

Non-standard extensions such as seconds fields, `L`, `W`, `#`, `?`, and
wrap-around ranges like `FRI-MON`. They are rejected with a syntax error
rather than silently misread.

## License

[MIT](LICENSE)
