import { isFutprepPath, type Attribution, type SourceChannel } from "./attribution";
import { nassauToday } from "./futprepTerms";

// The growth report (brief 05, parts 2 and 3): pure rules, shared by the
// event route, the report queries, the monthly email, the scheduled jobs
// and the tests. No server imports.
//
// Nothing here ever touches a child's medical, allergy or emergency
// details: the report's inputs do not carry them.

// ---- Page events ------------------------------------------------------------

export const PAGE_EVENTS = ["view", "whatsapp_click", "register_click", "register_start"] as const;
export type PageEvent = (typeof PAGE_EVENTS)[number];

export function isPageEvent(value: unknown): value is PageEvent {
  return typeof value === "string" && (PAGE_EVENTS as readonly string[]).includes(value);
}

// The path saved with an event: one of the business's public pages, with
// nothing personal in it. Staff pages and a parent's status pages (whose
// address holds a reference code) are never recorded; a return link is
// recorded without its token.
export function cleanEventPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path.length > 120 || !/^\/[A-Za-z0-9\-_/]*$/.test(path)) return null;
  if (!isFutprepPath(path)) return null;
  if (path === "/futprep/staff" || path.startsWith("/futprep/staff/")) return null;
  if (path === "/futprep/my" || path.startsWith("/futprep/my/")) return null;
  if (path.startsWith("/futprep/register/return")) return "/futprep/register/return";
  return path.toLowerCase();
}

// How a visitor reached the business, from the first-party attribution
// cookie alone (no form answer exists yet). The same evidence rules as a
// registration: a PortPass link, a QR, or arriving from a PortPass page.
export function channelFromAttribution(attribution: Attribution | null): SourceChannel {
  if (!attribution) return "unknown";
  if ((attribution.utmSource ?? "").toLowerCase() === "portpass") {
    const medium = (attribution.utmMedium ?? "").toLowerCase();
    if (medium === "qr") return "qr";
    if (medium.includes("perk")) return "member_perk";
    return "portpass_link";
  }
  if (attribution.viaPortpass) return "portpass_listing";
  const host = attribution.referrerHost ?? "";
  const source = (attribution.utmSource ?? "").toLowerCase();
  const from = (name: string) => host === name || host.endsWith(`.${name}`) || source === name.split(".")[0];
  if (from("instagram.com")) return "instagram";
  if (from("google.com") || host.startsWith("google.") || host.includes(".google.")) return "google";
  if (from("whatsapp.com") || host === "wa.me") return "whatsapp";
  if (host || source) return "other";
  return "unknown";
}

export const CHANNEL_LABEL: Record<SourceChannel, string> = {
  portpass_listing: "Found on PortPass",
  portpass_link: "A PortPass link",
  qr: "PortPass QR code",
  instagram: "Instagram",
  google: "Google",
  whatsapp: "WhatsApp",
  referral: "Referral",
  member_perk: "PortPass member perk",
  word_of_mouth: "Word of mouth",
  school: "School",
  other: "Another website",
  unknown: "Came straight to the page",
};

// ---- Nassau time --------------------------------------------------------------

export type NassauClock = { date: string; weekday: number; hour: number; minute: number };

// The date and time in Nassau for an instant. weekday: 0 Sunday .. 6 Saturday.
export function nassauClock(now: Date = new Date()): NassauClock {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  // The weekday of that calendar date (a date at noon UTC has no time zone
  // to trip over).
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, weekday, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(`${endIso}T12:00:00Z`) - Date.parse(`${startIso}T12:00:00Z`)) / 86_400_000);
}

// The day a payment was received. Staff pick a date, which is stored as
// midnight UTC of that date: it is that calendar date, as typed. Anything
// else is a real moment, read in Nassau time.
export function receivedDate(raw: string): string {
  return /T00:00:00(\.0+)?(Z|\+00(:?00)?)$/.test(raw) ? raw.slice(0, 10) : nassauToday(new Date(raw));
}

// ---- Terms: "this term against last term" ----------------------------------------

// isClass: a weekly class term (programme type "term"). Camps are not
// class terms; school contracts are left out of the report altogether.
export type GrowthTerm = { id: number; programId: number; name: string; startDate: string; endDate: string; isClass: boolean };
// eventsFrom: the first day whose views, taps and requests count towards
// this term (the day after the term before ended; null when there is no
// earlier term, so everything before counts). A term's families find it
// and sign up before it starts.
export type GrowthPeriod = { label: string; start: string; end: string; termIds: number[]; eventsFrom: string | null };

function overlapping(classes: GrowthTerm[], pick: GrowthTerm): GrowthTerm[] {
  return classes.filter((t) => t.startDate <= pick.endDate && t.endDate >= pick.startDate);
}

function periodOf(anchor: GrowthTerm[], all: GrowthTerm[], eventsFrom: string | null, fallbackLabel: string): GrowthPeriod {
  const start = anchor.map((t) => t.startDate).sort()[0];
  const end = anchor.map((t) => t.endDate).sort().slice(-1)[0];
  // Every term belongs to exactly one period, by its start date: the
  // classes that define the period, a camp held during it, and a camp held
  // in the gap before it (a Christmas camp counts with the January term).
  const inside = all.filter((t) => t.startDate <= end && (eventsFrom === null || t.startDate >= eventsFrom));
  const names = Array.from(new Set(anchor.map((t) => t.name)));
  return { label: names.length === 1 ? names[0] : fallbackLabel, start, end, termIds: inside.map((t) => t.id), eventsFrom };
}

// The term running today (or, between terms, the next one to start, or
// failing that the last one to finish), and the term before it. A "term" is
// every class term that overlaps, so Lil Kickers and Kickers count together.
export function termPeriods(terms: GrowthTerm[], today: string): { current: GrowthPeriod | null; previous: GrowthPeriod | null } {
  const classes = terms.filter((t) => t.isClass);
  if (classes.length === 0) return { current: null, previous: null };
  let anchor = classes.filter((t) => t.startDate <= today && t.endDate >= today);
  if (anchor.length === 0) {
    const upcoming = classes.filter((t) => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const ended = classes.filter((t) => t.endDate < today).sort((a, b) => b.endDate.localeCompare(a.endDate));
    anchor = overlapping(classes, upcoming[0] ?? ended[0]);
  }
  const currentStart = anchor.map((t) => t.startDate).sort()[0];
  const before = classes.filter((t) => t.endDate < currentStart).sort((a, b) => b.endDate.localeCompare(a.endDate));
  if (before.length === 0) return { current: periodOf(anchor, terms, null, "This term"), previous: null };

  const previousAnchor = overlapping(before, before[0]);
  const previousStart = previousAnchor.map((t) => t.startDate).sort()[0];
  const previousEnd = previousAnchor.map((t) => t.endDate).sort().slice(-1)[0];
  const earlier = classes.filter((t) => t.endDate < previousStart).sort((a, b) => b.endDate.localeCompare(a.endDate));
  const previous = periodOf(previousAnchor, terms, earlier.length > 0 ? addDays(earlier[0].endDate, 1) : null, "Last term");
  const current = periodOf(anchor, terms, addDays(previousEnd, 1), "This term");
  return { current, previous };
}

// ---- The report's rows ----------------------------------------------------------

export type GrowthProgram = { id: number; name: string; capacity: number };
// No health, emergency or contact fields: a first name is all the report
// may show about a child.
export type GrowthRegistration = {
  id: number;
  programId: number;
  termId: number;
  status: string;
  isNewFamily: boolean | null;
  commissionEligible: boolean;
  submittedOn: string;
  // The term fee, or one week's fee for a family paying weekly.
  amountDueCents: number;
  paysWeekly: boolean;
  feeWaived: boolean;
  childFirstName: string;
};
export type GrowthPayment = { id: number; registrationId: number; amountCents: number; receivedOn: string };
export type GrowthSession = { id: number; programId: number; termId: number; date: string; status: string };
export type GrowthAttendance = { registrationId: number; sessionId: number; status: string };
export type EventCount = { event: PageEvent; sourceChannel: SourceChannel; count: number };

// A place in the class: the statuses that take a spot and owe a fee.
const ENROLLED = ["pending", "confirmed", "pending_details"];
export function isEnrolled(status: string): boolean {
  return ENROLLED.includes(status);
}

// The form has one "child's full name" box. "Jayden Rolle" gives Jayden;
// "Rolle, Jayden" (surname first, with a comma) also gives Jayden. Without
// a comma there is no telling which word is the surname, so the first word
// is used.
export function firstNameOf(childName: string): string {
  const [beforeComma, afterComma] = childName.split(",");
  const part = afterComma && afterComma.trim() ? afterComma : beforeComma;
  return (part.trim().split(/\s+/)[0] ?? "").replace(/[.,;:]+$/, "");
}

// ---- Attendance -------------------------------------------------------------------

// Came: marked present or late. Coaches mark a session in one of two ways:
// they tap everyone who came, or they tap only the children who did not.
// So a child with no mark came if the session's marks are all "did not
// come" marks, and did not come if the coach was marking arrivals.
const CAME = ["present", "late"];

function attendanceReader(attendance: GrowthAttendance[]) {
  const bySession = new Map<number, Map<number, string>>();
  for (const a of attendance) {
    if (!bySession.has(a.sessionId)) bySession.set(a.sessionId, new Map());
    bySession.get(a.sessionId)!.set(a.registrationId, a.status);
  }
  return {
    taken: (sessionId: number) => (bySession.get(sessionId)?.size ?? 0) > 0,
    came: (sessionId: number, registrationId: number) => {
      const marks = bySession.get(sessionId);
      if (!marks || marks.size === 0) return false;
      const mark = marks.get(registrationId);
      if (mark !== undefined) return CAME.includes(mark);
      const coachMarkedArrivals = Array.from(marks.values()).some((status) => CAME.includes(status));
      return !coachMarkedArrivals;
    },
  };
}

// What a family owes so far. A term payer owes the term fee; a weekly
// payer owes one week's fee for each session held since they joined; a
// waived fee is nothing.
function dueCents(registration: GrowthRegistration, sessions: GrowthSession[], today: string): number {
  if (registration.feeWaived) return 0;
  if (!registration.paysWeekly) return registration.amountDueCents;
  const held = sessions.filter((s) => s.programId === registration.programId && s.termId === registration.termId && s.status !== "cancelled" && s.date <= today && s.date >= registration.submittedOn).length;
  return registration.amountDueCents * held;
}

export type PeriodReport = {
  label: string;
  start: string;
  end: string;
  found: { views: number; bySource: Array<{ channel: SourceChannel; label: string; views: number }> };
  asked: { whatsappTaps: number; registerClicks: number; privateRequests: number };
  booked: {
    started: number;
    completed: number;
    // Children, not households: a new family's second child counts here too.
    newFamilyChildren: number;
    returningFamilyChildren: number;
    waitlist: number;
    tasters: number;
    classes: Array<{ programName: string; registered: number; capacity: number; fillPercent: number }>;
  };
  paid: { dueCents: number; collectedCents: number; outstandingCents: number; classes: Array<{ programName: string; dueCents: number; collectedCents: number; outstandingCents: number }> };
  showedUp: { sessions: Array<{ date: string; programName: string; enrolled: number; present: number; taken: boolean; percent: number | null }>; averagePercent: number | null };
};

export function buildPeriodReport(input: {
  period: GrowthPeriod;
  today: string;
  programs: GrowthProgram[];
  registrations: GrowthRegistration[];
  payments: GrowthPayment[];
  sessions: GrowthSession[];
  attendance: GrowthAttendance[];
  events: EventCount[];
  privateRequests: number;
}): PeriodReport {
  const { period, today, programs } = input;
  const termIds = new Set(period.termIds);
  const registrations = input.registrations.filter((r) => termIds.has(r.termId));
  const enrolled = registrations.filter((r) => isEnrolled(r.status));
  const programName = (id: number) => programs.find((p) => p.id === id)?.name ?? "Class";

  // Found you / Asked: counts only.
  const count = (event: PageEvent) => input.events.filter((e) => e.event === event).reduce((sum, e) => sum + e.count, 0);
  const viewsBySource = new Map<SourceChannel, number>();
  for (const e of input.events) if (e.event === "view") viewsBySource.set(e.sourceChannel, (viewsBySource.get(e.sourceChannel) ?? 0) + e.count);
  const bySource = Array.from(viewsBySource.entries())
    .map(([channel, views]) => ({ channel, label: CHANNEL_LABEL[channel], views }))
    .sort((a, b) => b.views - a.views);

  // Booked.
  const programIds = Array.from(new Set(enrolled.map((r) => r.programId)));
  const classes = programIds
    .map((id) => {
      const registered = enrolled.filter((r) => r.programId === id).length;
      const capacity = programs.find((p) => p.id === id)?.capacity ?? 0;
      return { programName: programName(id), registered, capacity, fillPercent: capacity > 0 ? Math.round((registered / capacity) * 100) : 0 };
    })
    .sort((a, b) => a.programName.localeCompare(b.programName));

  // Paid: collected is what was received, never what is due.
  const paidBy = new Map<number, number>();
  for (const p of input.payments) paidBy.set(p.registrationId, (paidBy.get(p.registrationId) ?? 0) + p.amountCents);
  const money = (rows: GrowthRegistration[]) => {
    let due = 0;
    let collectedCents = 0;
    let outstandingCents = 0;
    for (const r of rows) {
      const owed = dueCents(r, input.sessions, today);
      const collected = paidBy.get(r.id) ?? 0;
      due += owed;
      collectedCents += collected;
      outstandingCents += Math.max(0, owed - collected);
    }
    return { dueCents: due, collectedCents, outstandingCents };
  };
  const paidClasses = programIds.map((id) => ({ programName: programName(id), ...money(enrolled.filter((r) => r.programId === id)) })).sort((a, b) => a.programName.localeCompare(b.programName));

  // Showed up: sessions already held, most recent first.
  const marks = attendanceReader(input.attendance);
  const held = input.sessions.filter((s) => termIds.has(s.termId) && s.date <= today && s.status !== "cancelled").sort((a, b) => b.date.localeCompare(a.date) || a.programId - b.programId);
  const sessions = held
    .map((s) => {
      const expected = enrolled.filter((r) => r.programId === s.programId && r.termId === s.termId && r.submittedOn <= s.date);
      const taken = marks.taken(s.id);
      const present = taken ? expected.filter((r) => marks.came(s.id, r.id)).length : 0;
      return { date: s.date, programName: programName(s.programId), enrolled: expected.length, present, taken, percent: taken && expected.length > 0 ? Math.round((present / expected.length) * 100) : null };
    })
    // A session of a class nobody had joined yet is not a session to report on.
    .filter((s) => s.enrolled > 0);
  const scored = sessions.filter((s) => s.percent !== null);
  const averagePercent = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + (s.percent ?? 0), 0) / scored.length) : null;

  return {
    label: period.label,
    start: period.start,
    end: period.end,
    found: { views: count("view"), bySource },
    asked: { whatsappTaps: count("whatsapp_click"), registerClicks: count("register_click"), privateRequests: input.privateRequests },
    booked: {
      started: count("register_start"),
      completed: enrolled.length,
      newFamilyChildren: enrolled.filter((r) => r.isNewFamily === true).length,
      returningFamilyChildren: enrolled.filter((r) => r.isNewFamily !== true).length,
      waitlist: registrations.filter((r) => r.status === "waitlist").length,
      tasters: registrations.filter((r) => r.status === "trial").length,
      classes,
    },
    paid: { ...money(enrolled), classes: paidClasses },
    showedUp: { sessions, averagePercent },
  };
}

// Children who did not come to the last two sessions of their class for
// which attendance was taken. First name and class only.
export function missedTwoInARow(input: { today: string; programs: GrowthProgram[]; registrations: GrowthRegistration[]; sessions: GrowthSession[]; attendance: GrowthAttendance[] }): Array<{ childFirstName: string; programName: string }> {
  const marks = attendanceReader(input.attendance);
  const missed: Array<{ childFirstName: string; programName: string }> = [];
  for (const r of input.registrations) {
    if (!isEnrolled(r.status)) continue;
    // Sessions of this child's class that have happened, with attendance
    // taken, since the child registered: newest first.
    const taken = input.sessions
      .filter((s) => s.programId === r.programId && s.termId === r.termId && s.date <= input.today && s.date >= r.submittedOn && s.status !== "cancelled" && marks.taken(s.id))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (taken.length < 2) continue;
    if (taken.slice(0, 2).every((s) => !marks.came(s.id, r.id))) missed.push({ childFirstName: r.childFirstName, programName: input.programs.find((p) => p.id === r.programId)?.name ?? "Class" });
  }
  return missed.sort((a, b) => a.programName.localeCompare(b.programName) || a.childFirstName.localeCompare(b.childFirstName));
}

// Sessions whose attendance should have been marked and wasn't: the date
// has passed, or it is today and already noon in Nassau.
export function unmarkedSessions(input: { clock: NassauClock; sessions: GrowthSession[]; attendance: GrowthAttendance[]; registrations: GrowthRegistration[]; lookbackDays?: number }): GrowthSession[] {
  const marked = new Set(input.attendance.map((a) => a.sessionId));
  const earliest = addDays(input.clock.date, -(input.lookbackDays ?? 14));
  return input.sessions
    .filter((s) => s.status !== "cancelled" && s.date >= earliest && (s.date < input.clock.date || (s.date === input.clock.date && input.clock.hour >= 12)))
    .filter((s) => !marked.has(s.id))
    .filter((s) => input.registrations.some((r) => isEnrolled(r.status) && r.programId === s.programId && r.termId === s.termId && r.submittedOn <= s.date))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---- "Grow With Us": the commission -----------------------------------------------

export type CommissionTerms = { rateBps: number; capCentsPerMonth: number };
// The Founding Partner offer: 8% of fees collected from new families
// PortPass brought, capped at $120 for each month of the term ($360 for a
// three-month term).
export const GROW_WITH_US_OFFER: CommissionTerms = { rateBps: 800, capCentsPerMonth: 12_000 };

// A month of term is four weeks of it: an eleven-week term and a
// twelve-week term are both three months, so both cap at $360.
export function monthsInTerm(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((daysBetween(startIso, endIso) + 1) / 28));
}

export type CommissionLine = { paymentId: number; registrationId: number; receivedOn: string; collectedCents: number; feeCents: number };
export type Commission = { lines: CommissionLine[]; families: number; collectedCents: number; uncappedFeeCents: number; feeCents: number; capCents: number; capApplied: boolean };

// The fee for one term: a share of each payment actually received from a
// commissionable family, in the order the money came in, until the term's
// cap is reached. Fees due but not collected never count.
//
// `locked`: fees already on an invoice, by payment. They are fixed. Their
// total comes off the cap first, and only what is left is shared among the
// other payments, so the term can never go over its cap after invoicing.
export function commissionForTerm(input: { period: GrowthPeriod; registrations: GrowthRegistration[]; payments: GrowthPayment[]; terms: CommissionTerms; locked?: Map<number, number> }): Commission {
  const termIds = new Set(input.period.termIds);
  const eligible = new Set(input.registrations.filter((r) => termIds.has(r.termId) && r.commissionEligible && r.isNewFamily === true && r.status !== "cancelled").map((r) => r.id));
  const capCents = input.terms.capCentsPerMonth * monthsInTerm(input.period.start, input.period.end);
  const payments = input.payments.filter((p) => eligible.has(p.registrationId)).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id);
  const locked = input.locked ?? new Map<number, number>();
  let free = Math.max(0, capCents - payments.reduce((sum, p) => sum + (locked.get(p.id) ?? 0), 0));
  let feeCents = 0;
  let uncappedFeeCents = 0;
  let collectedCents = 0;
  const lines: CommissionLine[] = [];
  for (const payment of payments) {
    const full = Math.round((payment.amountCents * input.terms.rateBps) / 10_000);
    let fee: number;
    if (locked.has(payment.id)) {
      fee = locked.get(payment.id) ?? 0;
    } else {
      fee = Math.max(0, Math.min(full, free));
      free -= fee;
    }
    uncappedFeeCents += full;
    feeCents += fee;
    collectedCents += payment.amountCents;
    lines.push({ paymentId: payment.id, registrationId: payment.registrationId, receivedOn: payment.receivedOn, collectedCents: payment.amountCents, feeCents: fee });
  }
  return { lines, families: new Set(lines.map((l) => l.registrationId)).size, collectedCents, uncappedFeeCents, feeCents, capCents, capApplied: uncappedFeeCents > feeCents };
}

// One calendar month ("2026-10") across one or more terms' commission: a
// month at a term change has payments for both terms.
export function commissionForMonth(commissions: Commission | Commission[], month: string): { families: number; collectedCents: number; feeCents: number } {
  const lines = (Array.isArray(commissions) ? commissions : [commissions]).flatMap((c) => c.lines).filter((l) => l.receivedOn.startsWith(month));
  return { families: new Set(lines.map((l) => l.registrationId)).size, collectedCents: lines.reduce((sum, l) => sum + l.collectedCents, 0), feeCents: lines.reduce((sum, l) => sum + l.feeCents, 0) };
}

export function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---- When the scheduled jobs may act ------------------------------------------------

// The Saturday attendance nudge goes out at about 8:45 in the morning in
// Nassau. The job is scheduled at 12:45 and 13:45 UTC (the clocks change in
// November and March): in summer the first run is 8:45 and the second finds
// the session already nudged; in winter the first run is 7:45, too early
// for this window, and the second is 8:45.
export function isNudgeWindow(clock: NassauClock): boolean {
  if (clock.weekday !== 6) return false;
  const minutes = clock.hour * 60 + clock.minute;
  return minutes >= 8 * 60 && minutes <= 11 * 60;
}

// The monthly report goes out on the 1st, for the month just ended.
export function monthlyReportPeriod(clock: NassauClock): string | null {
  return clock.date.endsWith("-01") ? previousMonth(clock.date.slice(0, 7)) : null;
}
