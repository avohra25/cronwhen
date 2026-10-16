// Next / previous occurrence search over a parsed cron expression.
import { parse } from './parse.js';

const MINUTE = 60_000;
const DEFAULT_SEARCH_YEARS = 8; // enough to find Feb 29 schedules

// Thin accessors so the same search works in UTC or in the host's local zone.
function clock(utc) {
  return utc
    ? {
        year: (d) => d.getUTCFullYear(),
        month: (d) => d.getUTCMonth() + 1,
        day: (d) => d.getUTCDate(),
        weekday: (d) => d.getUTCDay(),
        hour: (d) => d.getUTCHours(),
        minute: (d) => d.getUTCMinutes(),
        make: (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi)),
      }
    : {
        year: (d) => d.getFullYear(),
        month: (d) => d.getMonth() + 1,
        day: (d) => d.getDate(),
        weekday: (d) => d.getDay(),
        hour: (d) => d.getHours(),
        minute: (d) => d.getMinutes(),
        make: (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi),
      };
}

function dayMatches(cron, c, d) {
  const dom = cron.dayOfMonth.has(c.day(d));
  const dow = cron.dayOfWeek.has(c.weekday(d));
  if (cron.dayOfMonthRestricted && cron.dayOfWeekRestricted) return dom || dow;
  return dom && dow;
}

function toCron(expression) {
  return typeof expression === 'string' ? parse(expression) : expression;
}

function toDate(value) {
  const d = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError(`invalid date: ${value}`);
  return d;
}

/**
 * Walk forward or backward one field at a time, jumping over whole months,
 * days and hours that cannot match. Each jump lands on a boundary, so the
 * loop is bounded by roughly (months + days + hours + minutes) in the window.
 */
function search(expression, options, direction) {
  const cron = toCron(expression);
  const c = clock(Boolean(options.utc));
  const from = toDate(options.from);
  const years = options.maxYears ?? DEFAULT_SEARCH_YEARS;
  const limitYear = c.year(from) + direction * years;

  // Start at the next (or previous) whole minute, strictly after (before) `from`.
  let t = new Date(Math.floor(from.getTime() / MINUTE) * MINUTE);
  t = new Date(t.getTime() + (direction > 0 ? MINUTE : t.getTime() === from.getTime() ? -MINUTE : 0));

  while (direction > 0 ? c.year(t) <= limitYear : c.year(t) >= limitYear) {
    const y = c.year(t);
    const mo = c.month(t);
    const d = c.day(t);
    const h = c.hour(t);
    if (!cron.month.has(mo)) {
      t = direction > 0 ? c.make(y, mo + 1, 1, 0, 0) : new Date(c.make(y, mo, 1, 0, 0).getTime() - MINUTE);
    } else if (!dayMatches(cron, c, t)) {
      t = direction > 0 ? c.make(y, mo, d + 1, 0, 0) : new Date(c.make(y, mo, d, 0, 0).getTime() - MINUTE);
    } else if (!cron.hour.has(h)) {
      t = direction > 0 ? c.make(y, mo, d, h + 1, 0) : new Date(c.make(y, mo, d, h, 0).getTime() - MINUTE);
    } else if (!cron.minute.has(c.minute(t))) {
      t = new Date(t.getTime() + direction * MINUTE);
    } else {
      return t;
    }
  }
  return null;
}

/** The first matching time strictly after `options.from` (default: now), or null. */
export function nextRun(expression, options = {}) {
  return search(expression, options, 1);
}

/** The last matching time strictly before `options.from` (default: now), or null. */
export function prevRun(expression, options = {}) {
  return search(expression, options, -1);
}

/** Up to `count` upcoming (or, with `options.reverse`, past) run times. */
export function runs(expression, count, options = {}) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
  const cron = toCron(expression);
  const step = options.reverse ? prevRun : nextRun;
  const out = [];
  let from = toDate(options.from);
  while (out.length < count) {
    const t = step(cron, { ...options, from });
    if (!t) break;
    out.push(t);
    from = t;
  }
  return out;
}

/** True when `date` falls inside a minute the expression fires on. */
export function matches(expression, date, options = {}) {
  const cron = toCron(expression);
  const c = clock(Boolean(options.utc));
  const d = toDate(date);
  return (
    cron.month.has(c.month(d)) &&
    dayMatches(cron, c, d) &&
    cron.hour.has(c.hour(d)) &&
    cron.minute.has(c.minute(d))
  );
}
