export const FUTPREP_TERM = {
  name: "Term 1",
  startDate: "2026-09-05",
  endDate: "2026-12-05",
  breakDates: ["2026-10-10", "2026-10-17"],
  location: "Lyford Cay Lower Campus Soccer Field",
} as const;

// Note: `slug` is the internal/database identifier only — it is never shown to
// parents or staff and is not part of any URL, so it intentionally stays as
// "rookies" even though the program is now publicly named "Futprep Kickers".
// Renaming it would mean migrating the live program/session/registration rows
// tied to that slug for zero user-visible benefit.
export const FUTPREP_PROGRAMS = [
  {
    slug: "lil-kickers",
    name: "Futprep Lil Kickers",
    ageMin: 3,
    ageMax: 5,
    day: "Saturday",
    time: "9:00 AM",
    endTime: "9:35 AM",
    capacity: 20,
    weeklyFeeCents: 3500,
    termFeeCents: 30000,
  },
  {
    slug: "rookies",
    name: "Futprep Kickers",
    ageMin: 5,
    ageMax: 7,
    day: "Saturday",
    time: "10:00 AM",
    endTime: "10:45 AM",
    capacity: 20,
    weeklyFeeCents: 4500,
    termFeeCents: 42000,
  },
] as const;

export type FutprepProgramSlug = (typeof FUTPREP_PROGRAMS)[number]["slug"];

export function programTimeRange(program: { time: string; endTime: string }) {
  return `${program.time}–${program.endTime}`;
}

export const FUTPREP_BANK_DETAILS = {
  status: "confirmed",
  bankName: "First Caribbean International Bank (Bahamas) Limited",
  swiftCode: "FCIBBSNS",
  accountName: "Futprep Athletics",
  accountNumber: "07046-2017344879",
} as const;

export const CONSENT_VERSION = "futprep-lil-kickers-term1-v1";

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-BS", {
    style: "currency",
    currency: "BSD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function programBySlug(slug: string) {
  return FUTPREP_PROGRAMS.find((program) => program.slug === slug);
}

export function activeSessionDates() {
  const dates: string[] = [];
  const breaks = new Set<string>(FUTPREP_TERM.breakDates);
  const cursor = new Date(`${FUTPREP_TERM.startDate}T12:00:00Z`);
  const end = new Date(`${FUTPREP_TERM.endDate}T12:00:00Z`);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!breaks.has(iso)) dates.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}
