// Pure date/scheduling logic shared by db/programs.ts (new programs) and
// db/registrations.ts (the Futprep pilot seed) - previously duplicated
// between the two with a subtle inconsistency: only one of them snapped the
// cursor onto the program's weekday before generating sessions, so a term
// whose start date didn't already fall on the right weekday would have
// generated wrong dates depending on which code path created it.
export const WEEKDAYS: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function nextWeekdayOnOrAfter(dateIso: string, dayOfWeek: string): Date {
  const targetIndex = WEEKDAYS.indexOf(dayOfWeek);
  const cursor = new Date(`${dateIso}T12:00:00Z`);
  if (targetIndex < 0 || Number.isNaN(cursor.valueOf())) return cursor;
  while (cursor.getUTCDay() !== targetIndex) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor;
}

// Weekly session dates from the first occurrence of dayOfWeek on or after
// startDate through endDate (inclusive), skipping anything in breakDates.
export function generateWeeklySessionDates(input: {
  startDate: string;
  endDate: string;
  dayOfWeek: string;
  breakDates: readonly string[];
}): string[] {
  const breaks = new Set(input.breakDates);
  const cursor = nextWeekdayOnOrAfter(input.startDate, input.dayOfWeek);
  const end = new Date(`${input.endDate}T12:00:00Z`);
  const dates: string[] = [];

  while (cursor <= end) {
    const sessionDate = cursor.toISOString().slice(0, 10);
    if (!breaks.has(sessionDate)) dates.push(sessionDate);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return dates;
}

// Age in whole years on a given date - used to check a child against a
// program's age range as of the term start date, not today's date.
export function ageOnDate(dateOfBirth: string, onDate: string): number {
  const dob = new Date(`${dateOfBirth}T12:00:00Z`);
  const date = new Date(`${onDate}T12:00:00Z`);
  if (Number.isNaN(dob.valueOf()) || Number.isNaN(date.valueOf())) return -1;

  let age = date.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = date.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && date.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}
