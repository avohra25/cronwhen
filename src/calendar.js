// Zone-independent calendar arithmetic used by the day-of-month and
// day-of-week extensions. Months are 1-based, weekdays 0 (Sunday) to 6.

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The weekday (Mon-Fri) nearest to `day`, without leaving the month, or null
 * when the month has no such day. A Saturday moves back to Friday unless that
 * would cross into the previous month, and a Sunday moves forward to Monday
 * unless that would cross into the next one (Quartz "W" semantics).
 */
export function nearestWeekday(year, month, day) {
  const last = daysInMonth(year, month);
  if (day > last) return null;
  const wd = weekdayOf(year, month, day);
  if (wd === 6) return day === 1 ? 3 : day - 1;
  if (wd === 0) return day === last ? day - 2 : day + 1;
  return day;
}

/** The last Monday-to-Friday day of the month. */
export function lastWeekday(year, month) {
  const last = daysInMonth(year, month);
  const wd = weekdayOf(year, month, last);
  if (wd === 6) return last - 1;
  if (wd === 0) return last - 2;
  return last;
}

/** True when `day` of `month` satisfies a day-of-month rule from parse(). */
export function dayOfMonthRuleMatches(rule, year, month, day) {
  switch (rule.kind) {
    case 'last':
      return day === daysInMonth(year, month) - rule.offset;
    case 'lastWeekday':
      return day === lastWeekday(year, month);
    case 'nearestWeekday':
      return day === nearestWeekday(year, month, rule.day);
    default:
      throw new Error(`unknown day-of-month rule ${rule.kind}`);
  }
}
