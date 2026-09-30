// Futprep class rules (brief 12, 30 Sept): ages in months, and class caps
// from the coaches on duty. Pure, so the registration path, the staff
// roster and the public copy all agree.

// ---- Ages in months --------------------------------------------------------
// Lil Kickers is 1½–3 and Kickers 3–6, which whole-year columns can't hold.
// When a program has months set they win over age_min / age_max.

export type AgeRule = {
  ageMin: number;
  ageMax: number;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
};

// Whole months old on a date: 1 Jan 2025 to 31 Jul 2026 is 18 months, to
// 1 Aug 2026 is 19. -1 for an unreadable date.
export function ageInMonths(dateOfBirth: string, onDate: string): number {
  const dob = new Date(`${dateOfBirth}T12:00:00Z`);
  const date = new Date(`${onDate}T12:00:00Z`);
  if (Number.isNaN(dob.valueOf()) || Number.isNaN(date.valueOf())) return -1;
  let months = (date.getUTCFullYear() - dob.getUTCFullYear()) * 12 + (date.getUTCMonth() - dob.getUTCMonth());
  if (date.getUTCDate() < dob.getUTCDate()) months -= 1;
  return months;
}

// The range in months: explicit months when set, else "ages 3–6" means from
// the third birthday up to the day before the seventh.
export function ageRangeMonths(rule: AgeRule): { min: number; max: number } {
  const min = rule.ageMinMonths ?? rule.ageMin * 12;
  const max = rule.ageMaxMonths ?? rule.ageMax * 12 + 11;
  return { min, max };
}

export function fitsAgeRule(dateOfBirth: string, onDate: string, rule: AgeRule): boolean {
  const months = ageInMonths(dateOfBirth, onDate);
  if (months < 0) return false;
  const { min, max } = ageRangeMonths(rule);
  return months >= min && months <= max;
}

function lowerLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return String(years);
  if (rest === 6) return `${years}½`;
  return String(Math.round((months / 12) * 10) / 10);
}

// The top of a range is shown as the last birthday it includes: 47 months
// (3 years 11 months) reads "3"; 41 months (3 years 5 months) reads "3".
function upperLabel(months: number): string {
  const years = Math.floor(months / 12);
  return months % 12 >= 6 && months % 12 < 11 ? `${years}½` : String(years);
}

// "1½–3", "3–6", "6–15".
export function ageLabel(rule: AgeRule): string {
  const { min, max } = ageRangeMonths(rule);
  const low = lowerLabel(min);
  const high = upperLabel(max);
  return low === high ? low : `${low}–${high}`;
}

// ---- Class caps from coaches on duty ---------------------------------------

export type CapRule = {
  capacity: number;
  childrenPerCoach: number | null;
  // Coaches on duty for the session; null means the program's default.
  coachesOnDuty: number | null;
  defaultCoaches: number;
};

export function coachesFor(rule: Pick<CapRule, "coachesOnDuty" | "defaultCoaches">): number {
  return Math.max(0, rule.coachesOnDuty ?? rule.defaultCoaches);
}

// min(capacity, coaches on duty × children per coach). A program with no
// ratio set is capped by capacity alone.
export function effectiveCap(rule: CapRule): number {
  const capacity = Math.max(0, rule.capacity);
  if (!rule.childrenPerCoach || rule.childrenPerCoach <= 0) return capacity;
  return Math.min(capacity, coachesFor(rule) * rule.childrenPerCoach);
}

export function coachesNeeded(children: number, childrenPerCoach: number | null): number | null {
  if (!childrenPerCoach || childrenPerCoach <= 0) return null;
  return Math.ceil(Math.max(0, children) / childrenPerCoach);
}

// "20 children · 3 coaches · ratio OK" or "20 children · 1 coach · needs 2 more".
export function ratioSummary(children: number, coaches: number, childrenPerCoach: number | null): { text: string; ok: boolean } {
  const kids = `${children} ${children === 1 ? "child" : "children"}`;
  const staff = `${coaches} ${coaches === 1 ? "coach" : "coaches"}`;
  const needed = coachesNeeded(children, childrenPerCoach);
  if (needed === null) return { text: `${kids} · ${staff}`, ok: true };
  if (coaches >= needed) return { text: `${kids} · ${staff} · ratio OK`, ok: true };
  return { text: `${kids} · ${staff} · needs ${needed - coaches} more`, ok: false };
}

// ---- The free taster (brief 12) --------------------------------------------

// "12 Dec".
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

function joinWithOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

// The next taster Saturday among open class offers, and the classes on it.
export function upcomingTaster(
  offers: Array<{ programType: string; tasterDate: string | null; name: string }>,
  today: string,
): { date: string; classNames: string[] } | null {
  const upcoming = offers.filter((offer) => offer.programType === "term" && offer.tasterDate && offer.tasterDate >= today);
  if (upcoming.length === 0) return null;
  const date = upcoming.map((offer) => offer.tasterDate as string).sort()[0];
  const classNames = Array.from(new Set(upcoming.filter((offer) => offer.tasterDate === date).map((offer) => offer.name.replace(/^Futprep\s+/i, ""))));
  return { date, classNames };
}

// The public card copy (brief 12), with the date and classes from data.
export function tasterCardCopy(taster: { date: string; classNames: string[] }): { title: string; body: string } {
  return {
    title: `Free taster Saturday, ${shortDate(taster.date)}.`,
    body: `Bring your little one to try ${joinWithOr(taster.classNames)} with Coach Bex. Free with a PortPass account. Limited spots.`,
  };
}
