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

/** Collapse sorted numbers into runs: [1,2,3,5] -> [[1,3],[5,5]]. */
function runsOf(values) {
  const out = [];
  for (const v of values) {
    const last = out.at(-1);
    if (last && v === last[1] + 1) last[1] = v;
    else out.push([v, v]);
  }
  return out;
}

function listWithRanges(values, label) {
  return joinList(
    runsOf(values).map(([a, b]) => {
      if (a === b) return label(a);
      if (b === a + 1) return `${label(a)} and ${label(b)}`;
      return `${label(a)} through ${label(b)}`;
    }),
  );
}

const stepOf = (text) => /^\*\/(\d+)$/.exec(text)?.[1];

function timePart(cron) {
  const [minText, hourText] = cron.fields;
  const minutes = sorted(cron.minute);
  const hours = sorted(cron.hour);

  if (minText === '*' && hourText === '*') return 'Every minute';
  const minStep = stepOf(minText);
  if (minStep && hourText === '*') return `Every ${minStep} minutes`;
  if (minText === '*') return `Every minute during ${listWithRanges(hours, (h) => pad(h) + ':00')}`;
  if (minStep) return `Every ${minStep} minutes during ${listWithRanges(hours, (h) => pad(h) + ':00')}`;

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
  return `At ${minutes.length > 1 ? 'minutes' : 'minute'} ${joinList(minutes.map(String))} past ${listWithRanges(hours, (h) => pad(h) + ':00')}`;
}

function dayPart(cron) {
  const [, , domText, monText, dowText] = cron.fields;
  const parts = [];

  const domStep = stepOf(domText);
  const dom = domStep ? `every ${domStep} days` : `on the ${listWithRanges(sorted(cron.dayOfMonth), ordinal)}`;
  const dow = `on ${listWithRanges(sorted(cron.dayOfWeek), (d) => DAYS[d])}`;

  if (cron.dayOfMonthRestricted && cron.dayOfWeekRestricted) {
    parts.push(`${dom} or ${dow}`);
  } else {
    if (domText !== '*') parts.push(domStep ? dom : `${dom} of the month`);
    if (dowText !== '*') parts.push(dow);
  }

  if (monText !== '*') {
    const monStep = stepOf(monText);
    parts.push(monStep ? `every ${monStep} months` : `in ${listWithRanges(sorted(cron.month), (m) => MONTHS[m - 1])}`);
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

