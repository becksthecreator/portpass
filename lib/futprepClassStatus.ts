// What the badge on a Futprep class page says (19 Nov 2026). It used to say
// "Open now" on every class page whatever the term, so in November the
// pages read "Open now" while Term 2's registration was weeks away.
// The answer comes from the class's own terms (program_terms), the same
// rows registration reads, so the page and the form can't disagree.

export type TermWindow = {
  active: boolean;
  endDate: string; // YYYY-MM-DD
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
};

export type ClassBadge = { open: boolean; label: string };

const NASSAU_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Nassau" });
const nassauDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Nassau" });

export function classBadge(terms: TermWindow[], now: Date = new Date()): ClassBadge {
  const today = nassauDate(now);
  const live = terms.filter((t) => t.active && t.endDate >= today);
  const isOpen = (t: TermWindow) =>
    (!t.registrationOpensAt || new Date(t.registrationOpensAt) <= now) &&
    (!t.registrationClosesAt || new Date(t.registrationClosesAt) > now);
  if (live.some(isOpen)) return { open: true, label: "Open now" };

  const next = live
    .map((t) => t.registrationOpensAt)
    .filter((at): at is string => Boolean(at) && new Date(at!) > now)
    .sort()[0];
  if (next) return { open: false, label: `Registration opens ${NASSAU_DAY.format(new Date(next)).replace(",", "")}` };
  return { open: false, label: "Registration closed" };
}
