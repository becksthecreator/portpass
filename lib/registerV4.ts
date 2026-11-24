// The FutPrep register V4's logic, kept apart from the screen so it can be
// tested: the term's dates, which classes a birthday fits, and the plain
// money maths. The server still checks every rule (ages, caps, duplicates);
// this only says the same things earlier.
import { ageInMonths, ageRangeMonths, type AgeRule } from "./futprepClasses";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type TermShape = { day: string; termStartDate: string; termEndDate: string; breakDates: string[]; programType: string };

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Every session day of the term: the class's weekday from the first day to
// the last, less the break days. A camp runs every weekday of its dates.
export function termDates(offer: TermShape): string[] {
  const out: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(offer.termStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(offer.termEndDate)) return out;
  const weekday = WEEKDAYS.findIndex((w) => offer.day.toLowerCase().startsWith(w));
  for (let date = offer.termStartDate, guard = 0; date <= offer.termEndDate && guard < 400; date = addDays(date, 1), guard += 1) {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const runs = offer.programType === "camp" ? dow >= 1 && dow <= 5 : dow === weekday;
    if (runs && !offer.breakDates.includes(date)) out.push(date);
  }
  return out;
}

// The classes a child born on `dob` fits, by age on each term's first day
// (brief 12): the same rule the server checks (AGE_MISMATCH).
export function classesForBirthday<T extends AgeRule & { termStartDate: string }>(dob: string, offers: readonly T[]): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return [];
  return offers.filter((o) => {
    const months = ageInMonths(dob, o.termStartDate);
    if (months < 0) return false;
    const { min, max } = ageRangeMonths(o);
    return months >= min && months <= max;
  });
}

// "1 year 6 months" style, for the line under a birthday.
export function ageOnDay(dob: string, day: string): string {
  const months = ageInMonths(dob, day);
  if (months < 0) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} ${rest === 1 ? "month" : "months"}`;
  return rest ? `${years} ${years === 1 ? "year" : "years"} ${rest} ${rest === 1 ? "month" : "months"}` : `${years} ${years === 1 ? "year" : "years"}`;
}

// What one child's place costs: per session, or the term. A saving is
// shown only when the term price really is below the sessions it covers;
// nothing is claimed otherwise (the live prices are 10 × $34 = $340).
export function priceFor(offer: { weeklyFeeCents: number; termFeeCents: number; programType: string }, sessions: number, plan: "weekly" | "term") {
  if (offer.programType === "camp") return { dueCents: offer.termFeeCents, eachCents: null as number | null, savingCents: 0, plan: "term" as const };
  const weeklyTotal = offer.weeklyFeeCents * sessions;
  const savingCents = sessions > 0 && offer.termFeeCents < weeklyTotal ? weeklyTotal - offer.termFeeCents : 0;
  return plan === "term"
    ? { dueCents: offer.termFeeCents, eachCents: null, savingCents, plan }
    : { dueCents: offer.weeklyFeeCents, eachCents: offer.weeklyFeeCents, savingCents, plan };
}
