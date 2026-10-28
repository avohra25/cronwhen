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
- Wrap-around ranges such as `FRI-MON`, `22-2` (late night) and `NOV-FEB`.
- Macros: `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`.
- Next and previous run times, in UTC or the host's local time zone.
- Vixie cron day semantics: when both day-of-month and day-of-week are
  restricted, a day matches if **either** does (`0 0 13 * FRI` is "the 13th or
  any Friday").
- Quartz-style day-of-month extensions: `L` (last day), `L-3` (three days
  before the last day), `LW` (last weekday) and `15W` (weekday nearest the
  15th), plus `?` as "no specific value" in either day field.
- Weekday-of-month rules: `FRI#3` (third Friday) and `5L` or `FRIL` (last
  Friday of the month).
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

## Day-of-month extensions

These come from Quartz and other schedulers and can be mixed with plain values
in a list, as in `1,15,L`.

| Token | Meaning | Example |
|---|---|---|
| `L` | Last day of the month (28th to 31st) | `0 0 L * *` |
| `L-n` | `n` days before the last day (`n` is 0 to 30) | `0 0 L-2 * *` fires on Jan 29, Feb 26 (2027) |
| `LW` | Last Monday-to-Friday day of the month | `0 17 LW * *` for month-end close |
| `nW` | Weekday nearest the `n`th, never leaving the month | `0 9 15W * *` fires on Fri Aug 14, 2026 because the 15th is a Saturday |
| `?` | Same as `*`, accepted in the day fields for Quartz compatibility | `0 12 ? * MON` |

`1W` on a month that starts on Saturday moves forward to Monday the 3rd, and
`31W` on a Sunday moves back to Friday the 29th. A `W` day that the month
doesn't have (such as `31W` in April) doesn't fire that month. The Vixie
either-day rule still applies, so `0 0 L * FRI` means "the last day of the
month, or any Friday".

## Day-of-week extensions

| Token | Meaning | Example |
|---|---|---|
| `D#n` | The `n`th weekday `D` of the month (`n` is 1 to 5) | `0 10 * * FRI#3` fires Oct 16, Nov 20, Dec 18 (2026) |
| `DL` | The last weekday `D` of the month | `0 18 * * 5L` or `0 18 * * FRIL` |

`D` is a number (0 to 7) or a three-letter name. These rules mix freely with
plain weekdays, so `0 9 * * MON,FRIL` runs every Monday and on the last Friday.
`#5` only fires in months that actually have a fifth such weekday. A bare `L`
in the day-of-week field is rejected because schedulers disagree on what it
means.

```console
$ cronwhen -u -n 3 --from 2026-10-01T00:00:00Z "0 10 * * FRI#3"
At 10:00, on the third Friday of the month

Next runs:
  2026-10-16T10:00:00Z
  2026-11-20T10:00:00Z
  2026-12-18T10:00:00Z
```

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

## Wrap-around ranges

A range whose start comes after its end wraps past the end of the field
instead of being an error. `0 9 * * FRI-MON` runs Friday, Saturday, Sunday and
Monday; `*/15 22-2 * * *` runs every 15 minutes from 22:00 to 02:45; and
`0 0 1 NOV-FEB *` runs on the 1st of November through February. Steps keep
counting across the wrap, so `0 22-4/2 * * *` fires at 22:00, 00:00, 02:00
and 04:00. `describe()` keeps such ranges together ("on Friday through
Monday") rather than splitting them at the end of the week.

## Not supported

Six- and seven-field expressions (seconds and year fields) and a bare `L` in
the day-of-week field. They are rejected with a syntax error rather than
silently misread.

## License

[MIT](LICENSE)
