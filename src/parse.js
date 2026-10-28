// Parser for classic five-field cron expressions (Vixie cron flavour).

export const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], offset: 1 },
  { name: 'dayOfWeek', min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], offset: 0 },
];

export const MACROS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export class CronSyntaxError extends Error {
  constructor(message, field) {
    super(field ? `${field}: ${message}` : message);
    this.name = 'CronSyntaxError';
    this.field = field;
  }
}

function toNumber(token, spec) {
  const upper = token.toUpperCase();
  if (spec.names) {
    const idx = spec.names.indexOf(upper);
    if (idx !== -1) return idx + spec.offset;
  }
  if (!/^\d+$/.test(token)) {
    throw new CronSyntaxError(`invalid value "${token}"`, spec.name);
  }
  const n = Number(token);
  if (n < spec.min || n > spec.max) {
    throw new CronSyntaxError(`${n} is outside ${spec.min}-${spec.max}`, spec.name);
  }
  return n;
}

function parsePart(part, spec, values) {
  if (part === '') throw new CronSyntaxError('empty list item', spec.name);
  const [rangeText, stepText, extra] = part.split('/');
  if (extra !== undefined) throw new CronSyntaxError(`too many "/" in "${part}"`, spec.name);

  let step = 1;
  if (stepText !== undefined) {
    if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
      throw new CronSyntaxError(`invalid step "${stepText}"`, spec.name);
    }
    step = Number(stepText);
  }

  let lo;
  let hi;
  if (rangeText === '*') {
    lo = spec.min;
    hi = spec.max;
  } else if (rangeText.includes('-')) {
    const bounds = rangeText.split('-');
    if (bounds.length !== 2) throw new CronSyntaxError(`invalid range "${rangeText}"`, spec.name);
    lo = toNumber(bounds[0], spec);
    hi = toNumber(bounds[1], spec);
    if (lo > hi) throw new CronSyntaxError(`range ${rangeText} is backwards`, spec.name);
  } else {
    lo = toNumber(rangeText, spec);
    // "5/15" means "starting at 5, every 15" up to the field maximum.
    hi = stepText !== undefined ? spec.max : lo;
  }

  for (let v = lo; v <= hi; v += step) values.add(v);
}

// Quartz-style day-of-month extensions: "L" (last day), "L-3" (three days
// before the last day), "LW" (last weekday) and "15W" (weekday nearest the 15th).
function parseDayOfMonthRule(part, spec) {
  const upper = part.toUpperCase();
  if (upper === 'LW') return { kind: 'lastWeekday' };
  const last = /^L(?:-(\d+))?$/.exec(upper);
  if (last) {
    const offset = last[1] === undefined ? 0 : Number(last[1]);
    if (offset > 30) throw new CronSyntaxError(`"${part}" offset must be 0-30`, spec.name);
    return { kind: 'last', offset };
  }
  const near = /^(\d+)W$/.exec(upper);
  if (near) return { kind: 'nearestWeekday', day: toNumber(near[1], spec) };
  if (/[LW]/.test(upper)) throw new CronSyntaxError(`invalid value "${part}"`, spec.name);
  return null;
}

// Day-of-week extensions: "FRI#3" (third Friday of the month) and "5L" or
// "FRIL" (last Friday of the month).
function parseDayOfWeekRule(part, spec) {
  const nth = /^([A-Z0-9]+)#(\d+)$/i.exec(part);
  if (nth) {
    const n = Number(nth[2]);
    if (n < 1 || n > 5) throw new CronSyntaxError(`"#${nth[2]}" must be 1-5`, spec.name);
    return { kind: 'nth', weekday: toNumber(nth[1], spec) % 7, n };
  }
  const last = /^([A-Z]{3}|\d+)L$/i.exec(part);
  if (last) return { kind: 'lastOf', weekday: toNumber(last[1], spec) % 7 };
  if (part.toUpperCase() === 'L') {
    throw new CronSyntaxError('"L" needs a weekday, e.g. "5L" or "FRIL" for the last Friday', spec.name);
  }
  if (part.includes('#')) throw new CronSyntaxError(`invalid value "${part}"`, spec.name);
  return null;
}

function parseRule(part, spec) {
  if (part === '') return null;
  if (spec.name === 'dayOfMonth') return parseDayOfMonthRule(part, spec);
  if (spec.name === 'dayOfWeek') return parseDayOfWeekRule(part, spec);
  return null;
}

function parseField(text, spec) {
  const values = new Set();
  const rules = [];
  for (const part of text.split(',')) {
    const rule = parseRule(part, spec);
    if (rule) rules.push(rule);
    else parsePart(part, spec, values);
  }
  if (spec.name === 'dayOfWeek' && values.has(7)) {
    values.delete(7);
    values.add(0); // 7 is an alias for Sunday
  }
  return { values, rules };
}

/**
 * Parse a cron expression into sets of allowed values per field. Day-of-month
 * and day-of-week extensions that depend on the month ("L", "15W", "FRI#2",
 * "5L") are returned as `dayOfMonthRules` and `dayOfWeekRules` and evaluated
 * per date by the scheduler.
 * @param {string} expression e.g. "*\/15 9-17 * * MON-FRI" or "@daily"
 */
export function parse(expression) {
  if (typeof expression !== 'string') throw new CronSyntaxError('expression must be a string');
  let source = expression.trim();
  if (source.startsWith('@')) {
    const expanded = MACROS[source.toLowerCase()];
    if (!expanded) throw new CronSyntaxError(`unknown macro "${source}"`);
    source = expanded;
  }
  const parts = source.split(/\s+/);
  if (parts.length !== 5) {
    throw new CronSyntaxError(`expected 5 fields, got ${parts.length}`);
  }
  // "?" means "no specific value" in the day fields (Quartz); treat it as "*".
  if (parts[2] === '?') parts[2] = '*';
  if (parts[4] === '?') parts[4] = '*';
  const result = { source: expression.trim(), fields: parts };
  FIELDS.forEach((spec, i) => {
    const { values, rules } = parseField(parts[i], spec);
    result[spec.name] = values;
    if (spec.name === 'dayOfMonth') result.dayOfMonthRules = rules;
    if (spec.name === 'dayOfWeek') result.dayOfWeekRules = rules;
  });
  // Vixie cron: if either day field starts with "*" the two are ANDed, otherwise ORed.
  result.dayOfMonthRestricted = !parts[2].startsWith('*');
  result.dayOfWeekRestricted = !parts[4].startsWith('*');
  return result;
}
