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

function parseField(text, spec) {
  const values = new Set();
  for (const part of text.split(',')) parsePart(part, spec, values);
  if (spec.name === 'dayOfWeek' && values.has(7)) {
    values.delete(7);
    values.add(0); // 7 is an alias for Sunday
  }
  return values;
}

/**
 * Parse a cron expression into sets of allowed values per field.
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
  const result = { source: expression.trim(), fields: parts };
  FIELDS.forEach((spec, i) => {
    result[spec.name] = parseField(parts[i], spec);
  });
  // Vixie cron: if either day field starts with "*" the two are ANDed, otherwise ORed.
  result.dayOfMonthRestricted = !parts[2].startsWith('*');
  result.dayOfWeekRestricted = !parts[4].startsWith('*');
  return result;
}
