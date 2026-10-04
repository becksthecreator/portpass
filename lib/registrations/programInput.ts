// What a business types to add a class or a camp (brief 18, D4), checked
// and turned into what the database keeps. Pure: shared by the API and
// the tests.
import type { BusinessProgramInput } from "@/db/businessRegistrations";
import { nassauLocalToIso } from "@/lib/futprepTerms";
import { WEEKDAYS } from "@/lib/scheduling";

type Parsed = { ok: true; value: BusinessProgramInput } | { ok: false; error: string };

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const isoDate = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ? value : null);

// "18:30" (what a time field sends) -> "6:30 PM" (how programmes store it).
export function clockTime(value: unknown): string | null {
  const match = typeof value === "string" ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

// Dollars typed by a person ("25", "25.50", "$180") to cents; null if it
// isn't an amount.
export function dollarsToCents(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.replace(/[$,\s]/g, "") : "";
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

export function parseProgramInput(body: Record<string, unknown>): Parsed {
  const fail = (error: string): Parsed => ({ ok: false, error });
  const name = text(body.name, 80);
  if (name.length < 3) return fail("Give the class or camp a name.");
  const audience = body.audience === "adults" || body.audience === "mixed" ? body.audience : body.audience === "children" ? "children" : null;
  if (!audience) return fail("Say who it is for: children, adults, or both.");
  const programType = body.programType === "camp" ? "camp" : "term";

  // Adults need no age range; it is kept as 18 and over.
  const ageMin = audience === "adults" ? 18 : Number(body.ageMin);
  const ageMax = audience === "adults" ? 99 : Number(body.ageMax);
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 0 || ageMax < ageMin || ageMax > 99) return fail("Give the ages it is for, youngest then oldest.");
  if (audience === "children" && ageMin >= 18) return fail("A children's class is for under-18s. Choose adults, or both.");

  const dayOfWeek = programType === "camp" ? "Weekdays" : text(body.dayOfWeek, 12);
  if (programType === "term" && !WEEKDAYS.includes(dayOfWeek)) return fail("Choose the day of the week it runs.");
  const startTime = clockTime(body.startTime);
  const endTime = clockTime(body.endTime);
  if (!startTime || !endTime) return fail("Give the start and end time.");
  const location = text(body.location, 120);
  if (location.length < 2) return fail("Say where it happens.");
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fail("Give the number of places, from 1 to 500.");

  const termName = text(body.termName, 60) || (programType === "camp" ? "Camp" : "Term");
  const termStartDate = isoDate(body.termStartDate);
  const termEndDate = isoDate(body.termEndDate);
  if (!termStartDate || !termEndDate) return fail("Give the first and last date.");
  if (termEndDate < termStartDate) return fail("The last date is before the first.");
  if (Date.parse(`${termEndDate}T12:00:00Z`) - Date.parse(`${termStartDate}T12:00:00Z`) > 370 * 86_400_000) return fail("A term or camp can run for up to a year.");

  const termFeeCents = dollarsToCents(body.termFee);
  if (termFeeCents === null) return fail(programType === "camp" ? "Give the camp fee in dollars." : "Give the fee for the whole term in dollars.");
  // The weekly fee is optional: without one, the term is paid in full.
  const weeklyBlank = body.weeklyFee === undefined || body.weeklyFee === null || body.weeklyFee === "";
  const weeklyFeeCents = programType === "camp" ? termFeeCents : weeklyBlank ? 0 : dollarsToCents(body.weeklyFee);
  if (weeklyFeeCents === null) return fail("Give the weekly fee in dollars, or leave it blank.");

  let registrationClosesAt: string | null = null;
  if (typeof body.registrationClosesAt === "string" && body.registrationClosesAt.trim()) {
    registrationClosesAt = nassauLocalToIso(body.registrationClosesAt);
    if (!registrationClosesAt) return fail("Give the day and time registration closes.");
  }

  return { ok: true, value: { name, audience, programType, ageMin, ageMax, dayOfWeek, startTime, endTime, location, capacity, termName, termStartDate, termEndDate, weeklyFeeCents, termFeeCents, registrationClosesAt } };
}
