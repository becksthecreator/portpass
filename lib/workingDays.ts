// A coach's working days (Brief 29, part C), pure. ISO weekdays: 1 is
// Monday, 7 is Sunday. An empty list means no rule.

export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function cleanWorkingDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = value.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(days)].sort((a, b) => a - b);
}

// The ISO weekday of a YYYY-MM-DD date, read as a calendar date (no time zone).
export function isoWeekday(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return Number.isNaN(day) ? null : day === 0 ? 7 : day;
}

// True when the coach has no rule, or the date falls on one of their days.
export function isWorkingDay(workingDays: readonly number[], isoDate: string): boolean {
  if (workingDays.length === 0) return true;
  const day = isoWeekday(isoDate);
  return day !== null && workingDays.includes(day);
}

// "Mondays, Wednesdays and Fridays"; "Saturdays"; "" for no rule.
export function workingDaysLabel(workingDays: readonly number[]): string {
  const names = cleanWorkingDays([...workingDays]).map((d) => `${WEEKDAY_NAMES[d]}s`);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The sentence the drawer and the API answer with when a date is off.
export function dayOffMessage(coachName: string, workingDays: readonly number[]): string {
  return `${coachName} works ${workingDaysLabel(workingDays)}. Pick one of those days.`;
}
