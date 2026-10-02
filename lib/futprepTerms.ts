// Pure rules for Futprep programs and terms (brief 06 v2, Part A). Shared
// by db/registrations.ts, the camps page, the registration form and the
// tests; no server imports.

import { memberEarlyAccessOpen } from "./memberPerks";

export type ProgramType = "term" | "camp";

export type TermWindow = {
  active: boolean;
  endDate: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
};

// Today's date in Nassau, as YYYY-MM-DD. Camps and classes run on Nassau
// dates; the server runs in UTC.
export function nassauToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
}

// A term takes registrations when it is active, has not finished, and now
// is inside its window (an empty side of the window is no limit).
export function isTermOpen(term: TermWindow, now: Date = new Date()): boolean {
  if (!term.active) return false;
  if (term.endDate < nassauToday(now)) return false;
  if (term.registrationOpensAt && new Date(term.registrationOpensAt) > now) return false;
  if (term.registrationClosesAt && new Date(term.registrationClosesAt) <= now) return false;
  return true;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function asDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

// "13–16 Oct", "28 Dec – 2 Jan", "14 Dec".
export function formatDateRange(startIso: string, endIso: string): string {
  const start = asDate(startIso);
  const end = asDate(endIso);
  if (startIso === endIso) return DAY_MONTH.format(start);
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTH.format(end)}`;
  }
  return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}`;
}

// The weekday dates a camp runs (Mon-Fri, less break dates). Mirrors the
// database trigger public.generate_camp_sessions(); used for display.
export function campDays(startIso: string, endIso: string, breakDates: readonly string[] = []): string[] {
  const breaks = new Set(breakDates);
  const days: string[] = [];
  const cursor = asDate(startIso);
  const end = asDate(endIso);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5 && !breaks.has(iso)) days.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// The one line a parent reads to know what they are signing up for:
// "October Mid-Term Camp · 13–16 Oct · 9:00 AM–12:00 PM" for a camp,
// "Futprep Lil Kickers · Term 2 · Saturdays 9:00 AM–9:35 AM" for a class.
export function offerHeadline(offer: {
  name: string;
  programType: ProgramType;
  termName: string;
  termStartDate: string;
  termEndDate: string;
  day: string;
  time: string;
  endTime: string;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
}): string {
  if (offer.programType === "camp") {
    const start = offer.dailyStartTime || offer.time;
    const end = offer.dailyEndTime || offer.endTime;
    return `${offer.name} · ${formatDateRange(offer.termStartDate, offer.termEndDate)} · ${start}–${end}`;
  }
  return `${offer.name} · ${offer.termName} · ${offer.day}s ${offer.time}–${offer.endTime}`;
}

// The amount a new registration owes. Camps are paid in full (the camp
// fee); weekly/term choice exists only for term programs.
export function amountDueCents(offer: { programType: ProgramType; weeklyFeeCents: number; termFeeCents: number }, paymentFrequency: "weekly" | "term"): number {
  if (offer.programType === "camp") return offer.termFeeCents;
  return paymentFrequency === "term" ? offer.termFeeCents : offer.weeklyFeeCents;
}

// A staff member types "2026-10-12T18:00" meaning 6 pm in Nassau; the
// database stores an instant. Nassau is UTC-4 in summer and UTC-5 in
// winter, so the offset is read for that date rather than assumed.
export function nassauLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess + (guess - wall)).toISOString();
}

// Early access for returning families (brief 06 v2, Part C): an active,
// unfinished term whose early_access_until is still ahead takes
// registrations through a return link even before its public opening.
export function isTermEarlyAccessOpen(term: TermWindow & { earlyAccessUntil: string | null }, now: Date = new Date()): boolean {
  if (!term.active || !term.earlyAccessUntil) return false;
  if (term.endDate < nassauToday(now)) return false;
  return new Date(term.earlyAccessUntil) > now;
}

// Early access for PortPass members (brief 10): when the business has a
// live early-access perk, a signed-in member may register from that many
// hours before the public opening. The window closes the moment the term
// opens to everyone (from then it is simply open), and never reopens a
// term that has closed or finished.
export function isTermMemberEarlyOpen(term: TermWindow, hours: number | null | undefined, now: Date = new Date()): boolean {
  if (!term.active || !hours) return false;
  if (term.endDate < nassauToday(now)) return false;
  if (term.registrationClosesAt && new Date(term.registrationClosesAt) <= now) return false;
  return memberEarlyAccessOpen(term.registrationOpensAt, hours, now);
}

// "Join the rest of the term" after a free trial: the weekly fee for each
// class still to come after the trial Saturday.
export function prorateCents(weeklyFeeCents: number, remainingSessions: number): number {
  return Math.max(0, weeklyFeeCents) * Math.max(0, remainingSessions);
}
