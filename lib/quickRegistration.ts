import { ageInMonths, ageRangeMonths, type AgeRule } from "@/lib/futprepClasses";

// Booking in three taps (brief 27, C): the rules behind the Pick, Who and
// Done screens of /futprep/register, with no database in them so each is
// unit-tested in lib/quickRegistration.test.ts. The server keeps the real
// age check (brief 12) and the caps; these only tell the parent early.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type QuickOffer = AgeRule & {
  name: string;
  ageLabel: string;
  day: string;
  programType: "term" | "camp";
  termStartDate: string;
  termEndDate: string;
  breakDates: string[];
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The first date the class meets on or after today: the term's first day,
// or the next matching weekday, skipping break Saturdays. Null once the
// term has ended or the day can't be read.
export function nextSessionDate(offer: Pick<QuickOffer, "day" | "programType" | "termStartDate" | "termEndDate" | "breakDates">, today: string): string | null {
  const start = today > offer.termStartDate ? today : offer.termStartDate;
  if (start > offer.termEndDate) return null;
  if (offer.programType === "camp") return start;
  const weekday = WEEKDAYS.findIndex((name) => offer.day.toLowerCase().startsWith(name));
  if (weekday < 0) return null;
  for (let i = 0; i < 120; i += 1) {
    const date = addDays(start, i);
    if (date > offer.termEndDate) return null;
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === weekday && !offer.breakDates.includes(date)) return date;
  }
  return null;
}

// Whether the Who screen asks for months as well as years: the youngest
// group (Lil Kickers, from 18 months) needs them; a class for 3 to 6 does not.
export function asksMonths(offer: AgeRule): boolean {
  return ageRangeMonths(offer).min % 12 !== 0 || ageRangeMonths(offer).max < 48;
}

// The date of birth we store for an age given in months: the first of the
// month that many months ago, so "2 years 6 months" reads as exactly that
// on any day of this month ("turned it this month"). It is approximate;
// the registration says so in its notes.
export function dobFromAgeMonths(ageMonths: number, today: string): string {
  const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - ageMonths);
  return date.toISOString().slice(0, 10);
}

// An age given today, as months on the day the term starts: the day the
// rule is checked (brief 12), whether that day is ahead or behind. Worked
// out from the very date of birth the server will store, so the screen and
// the server never disagree.
export function ageMonthsAtTermStart(ageMonthsToday: number, today: string, termStartDate: string): number {
  return ageInMonths(dobFromAgeMonths(ageMonthsToday, today), termStartDate);
}

export function ageProblem(offer: QuickOffer, ageMonthsToday: number, today: string): string | null {
  if (!Number.isInteger(ageMonthsToday) || ageMonthsToday < 0) return "Enter the child's age.";
  const months = ageMonthsAtTermStart(ageMonthsToday, today, offer.termStartDate);
  const { min, max } = ageRangeMonths(offer);
  const when = offer.termStartDate > today ? ", counted on the day the term starts" : offer.termStartDate < today ? ", counted on the day the term started" : "";
  if (months < min || months > max) return `${offer.name} is for ages ${offer.ageLabel}${when}.`;
  return null;
}

export function ageWords(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years === 0) return `${months} ${months === 1 ? "month" : "months"}`;
  if (months === 0) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${years} ${years === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
}

// "Open in maps": a search, never coordinates we don't have.
export function mapsUrl(location: string, note?: string | null): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([location, note].filter(Boolean).join(", "))}`;
}

export type QuickHowToPay = { bankName: string; accountName: string; accountNumberLast4: string | null; transferInstructions: string; cashNote: string };

// What the Done screen says under "How to pay". Bank details come from the
// business's payment settings and show the last four digits only; without
// settings, the parent is told to ask for them. Cash is paid at the field.
export function howToPayLines(method: "bank_transfer" | "cash", howToPay: QuickHowToPay | null, referenceCode: string): string[] {
  if (method === "cash") return [howToPay?.cashNote.trim() || "Pay in cash at the field on the first Saturday. A coach will mark it paid.", `Say the reference ${referenceCode} when you pay.`];
  if (!howToPay || !howToPay.bankName.trim()) return ["Bank details come with your confirmation; message Futprep on WhatsApp if you need them sooner.", `Use ${referenceCode} as the transfer reference.`];
  const lines = [`${howToPay.bankName.trim()}${howToPay.accountName.trim() ? ` · ${howToPay.accountName.trim()}` : ""}${howToPay.accountNumberLast4 ? ` · account ending ${howToPay.accountNumberLast4}` : ""}`];
  if (howToPay.transferInstructions.trim()) lines.push(howToPay.transferInstructions.trim());
  lines.push(`Use ${referenceCode} as the transfer reference.`);
  return lines;
}
