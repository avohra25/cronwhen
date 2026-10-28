// Turn a cron expression into a short English sentence.
import { parse } from './parse.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n) => String(n).padStart(2, '0');
const sorted = (set) => [...set].sort((a, b) => a - b);

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Collapse sorted numbers into runs: [1,2,3,5] -> [[1,3],[5,5]]. With a
 * `cycle` ({ min, max }), a run touching the top of the cycle joins one
 * starting at the bottom, so weekdays [0,1,5,6] become [[5,1]] (Fri-Mon).
 */
function runsOf(values, cycle) {
  const out = [];
  for (const v of values) {
    const last = out.at(-1);
    if (last && v === last[1] + 1) last[1] = v;
    else out.push([v, v]);
  }
  if (cycle && out.length > 1 && out[0][0] === cycle.min && out.at(-1)[1] === cycle.max) {
    const first = out.shift();
    const last = out.pop();
    out.unshift([last[0], first[1]]);
  }
  return out;
}

function listWithRanges(values, label, cycle) {
  const size = cycle ? cycle.max - cycle.min + 1 : 0;
  return joinList(
    runsOf(values, cycle).map(([a, b]) => {
      if (a === b) return label(a);
      const span = b > a ? b - a : b - a + size;
      if (span === 1) return `${label(a)} and ${label(b)}`;
      return `${label(a)} through ${label(b)}`;
    }),
  );
}

const HOURS = { min: 0, max: 23 };
const WEEK = { min: 0, max: 6 };
const YEAR = { min: 1, max: 12 };

const stepOf = (text) => /^\*\/(\d+)$/.exec(text)?.[1];

function timePart(cron) {
  const [minText, hourText] = cron.fields;
  const minutes = sorted(cron.minute);
  const hours = sorted(cron.hour);

  if (minText === '*' && hourText === '*') return 'Every minute';
  const minStep = stepOf(minText);
  if (minStep && hourText === '*') return `Every ${minStep} minutes`;
  if (minText === '*') return `Every minute during ${listWithRanges(hours, (h) => pad(h) + ':00', HOURS)}`;
  if (minStep) return `Every ${minStep} minutes during ${listWithRanges(hours, (h) => pad(h) + ':00', HOURS)}`;

  if (hourText === '*') {
    return `At ${minutes.length > 1 ? 'minutes' : 'minute'} ${joinList(minutes.map(String))} past every hour`;
  }
  const hourStep = stepOf(hourText);
  if (hourStep && minutes.length === 1) {
    return `At minute ${minutes[0]} past every ${hourStep} hours`;
  }
  if (hours.length * minutes.length <= 6) {
    const times = [];
    for (const h of hours) for (const m of minutes) times.push(`${pad(h)}:${pad(m)}`);
    return `At ${joinList(times)}`;
  }
  return `At ${minutes.length > 1 ? 'minutes' : 'minute'} ${joinList(minutes.map(String))} past ${listWithRanges(hours, (h) => pad(h) + ':00', HOURS)}`;
}

function dayOfMonthRule(rule) {
  switch (rule.kind) {
    case 'last':
      // L-1 is the second-to-last day, L-3 the fourth-to-last, and so on.
      return rule.offset === 0 ? 'the last day' : `the ${ordinal(rule.offset + 1)}-to-last day`;
    case 'lastWeekday':
      return 'the last weekday';
    case 'nearestWeekday':
      return `the weekday nearest the ${ordinal(rule.day)}`;
    default:
      return rule.kind;
  }
}

function dayOfMonthPhrase(cron) {
  const items = [];
  const days = sorted(cron.dayOfMonth);
  if (days.length) items.push(`the ${listWithRanges(days, ordinal)}`);
  for (const rule of cron.dayOfMonthRules ?? []) items.push(dayOfMonthRule(rule));
  return `on ${joinList(items)}`;
}

const NTH = ['first', 'second', 'third', 'fourth', 'fifth'];

function dayOfWeekPhrase(cron) {
  const items = [];
  const days = sorted(cron.dayOfWeek);
  if (days.length) items.push(listWithRanges(days, (d) => DAYS[d], WEEK));
  for (const rule of cron.dayOfWeekRules ?? []) {
    const which = rule.kind === 'nth' ? NTH[rule.n - 1] : 'last';
    items.push(`the ${which} ${DAYS[rule.weekday]}`);
  }
  const suffix = (cron.dayOfWeekRules ?? []).length ? ' of the month' : '';
  return `on ${joinList(items)}${suffix}`;
}

function dayPart(cron) {
  const [, , domText, monText, dowText] = cron.fields;
  const parts = [];

  const domStep = stepOf(domText);
  const hasRules = (cron.dayOfMonthRules ?? []).length > 0;
  const dom = domStep ? `every ${domStep} days` : dayOfMonthPhrase(cron);
  const dow = dayOfWeekPhrase(cron);

  if (cron.dayOfMonthRestricted && cron.dayOfWeekRestricted) {
    parts.push(`${dom}${hasRules ? ' of the month' : ''} or ${dow}`);
  } else {
    if (domText !== '*') parts.push(domStep ? dom : `${dom} of the month`);
    if (dowText !== '*') parts.push(dow);
  }

  if (monText !== '*') {
    const monStep = stepOf(monText);
    parts.push(monStep ? `every ${monStep} months` : `in ${listWithRanges(sorted(cron.month), (m) => MONTHS[m - 1], YEAR)}`);
  }
  return parts;
}

/**
 * Describe an expression in English, e.g. "At 09:30, on Monday through Friday".
 * @param {string|object} expression a cron string or a value returned by parse()
 */
export function describe(expression) {
  const cron = typeof expression === 'string' ? parse(expression) : expression;
  return [timePart(cron), ...dayPart(cron)].join(', ');
}
