// The Progress Passport (brief 31, Part D), the pure rules: which skills a
// child is scored on, when a coach may score, what a mark, a note and a
// clip may be, and what a family sees once Futprep shares it. Shared by
// the routes, the screens and the tests. Children's health details have no
// place here.

import { ageInMonths } from "../futprepClasses";

export type PassportBand = "football" | "lil_kickers";
export type PassportStatus = "draft" | "shared";
export type MarkPhase = "start" | "end";

// Lil Kickers under 4 on the term's first day get the five early-years
// skills; everyone else the five football skills. Decided once, when the
// passport is made, so a birthday mid-term changes nothing.
export function bandFor(childDob: string | null | undefined, termStart: string): PassportBand {
  if (!childDob) return "football";
  const months = ageInMonths(childDob, termStart);
  return months >= 0 && months < 48 ? "lil_kickers" : "football";
}

export type SessionDay = { date: string; cancelled: boolean };

export type MarkWindows = {
  start: boolean;
  end: boolean;
  startOpens: string | null;
  startCloses: string | null;
  endOpens: string | null;
  endCloses: string | null;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// When a coach may score (`today` is Nassau's date). Counted on the term's
// own sessions, not the calendar: the taster Saturday and cancelled days
// don't count. Start marks: week 1, from the first session to six days
// after. End marks: the last two weeks, from the second-to-last session to
// a week after the last, so a break in the final fortnight is covered. A
// camp is short: both windows run the whole camp, end marks a week longer.
export function markWindows(input: { sessions: SessionDay[]; tasterDate: string | null; programType: string; today: string }): MarkWindows {
  const regular = input.sessions.filter((s) => !s.cancelled && s.date !== input.tasterDate).map((s) => s.date).sort();
  if (regular.length === 0) return { start: false, end: false, startOpens: null, startCloses: null, endOpens: null, endCloses: null };
  const first = regular[0];
  const last = regular[regular.length - 1];
  const startOpens = first;
  const startCloses = input.programType === "camp" ? last : addDays(first, 6);
  const endOpens = input.programType === "camp" ? first : regular.length >= 2 ? regular[regular.length - 2] : first;
  const endCloses = addDays(last, 7);
  const within = (from: string, to: string) => input.today >= from && input.today <= to;
  return { start: within(startOpens, startCloses), end: within(endOpens, endCloses), startOpens, startCloses, endOpens, endCloses };
}

// A mark is a whole number from 1 to 5, sent as a number.
export function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export const NOTE_MAX = 500;

// Words that mean a note is about a child's health, which goes to the
// family and so must never carry it (rule 3): the desk keeps those.
const HEALTH_WORDS = /\b(allerg\w*|asthma\w*|inhaler\w*|epi-?pens?|medic\w*|diabet\w*|insulin|seizures?|epilep\w*|diagnos\w*|adhd|autis\w*|injur\w*|concussion\w*|prescri\w*|meds?|peanuts?|nuts?|hospital\w*|sprain\w*|anaphyla\w*|stitch\w*)\b/i;

export function cleanNote(value: unknown): { ok: true; value: string } | { ok: false; reason: "type" | "too_long" | "health" } {
  if (value === null || value === undefined) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, reason: "type" };
  const note = value.trim();
  if (note.length > NOTE_MAX) return { ok: false, reason: "too_long" };
  if (HEALTH_WORDS.test(note)) return { ok: false, reason: "health" };
  return { ok: true, value: note };
}

// Where a clip may live: a link out (never embedded), over https, on one
// of these hosts or their subdomains. Futprep's own uploads can join the
// list once they have a home.
export const CLIP_HOSTS = ["youtube.com", "youtu.be", "drive.google.com"];
export const CLIP_URL_MAX = 2048;

export function cleanClipUrl(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || value.length > CLIP_URL_MAX) return { ok: false };
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { ok: false };
  const host = url.hostname.toLowerCase();
  if (!CLIP_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return { ok: false };
  return { ok: true, value: url.toString() };
}

// Only for a child whose family said yes to photos and videos.
export function clipAllowed(photoConsent: string | null | undefined): boolean {
  return photoConsent === "yes";
}

export type PassportSkill = { id: number; name: string };
export type PassportMark = { skillId: number; start: number | null; end: number | null };

// A passport is shared once every skill has an end mark. Shared is for
// good: it never goes back to draft, and sharing again changes nothing.
export function canShare(skills: PassportSkill[], marks: PassportMark[]): boolean {
  return skills.length > 0 && skills.every((skill) => marks.some((m) => m.skillId === skill.id && m.end !== null));
}

export type ParentPassport = {
  childFirstName: string;
  programName: string;
  termName: string;
  sharedAt: string | null;
  skills: Array<{ name: string; start: number | null; end: number | null }>;
  note: string;
  clipUrl: string | null;
  nextStep: { name: string } | null;
};

// What a family sees: nothing until the passport is shared; then the
// skills and marks, the coach's note, the clip only with photo permission
// yes, and the next step only if it is one of Futprep's published
// offerings. Built field by field: nothing else from the record can ride
// along.
export function parentPassportView(input: {
  status: PassportStatus;
  childName: string;
  programName: string;
  termName: string;
  sharedAt: string | null;
  skills: PassportSkill[];
  marks: PassportMark[];
  note: string | null;
  clipUrl: string | null;
  photoConsent: string | null;
  nextStep: { name: string; published: boolean; futprep: boolean } | null;
}): ParentPassport | null {
  if (input.status !== "shared") return null;
  return {
    childFirstName: input.childName.trim().split(/\s+/)[0] ?? "",
    programName: input.programName,
    termName: input.termName,
    sharedAt: input.sharedAt,
    skills: input.skills.map((skill) => {
      const mark = input.marks.find((m) => m.skillId === skill.id);
      return { name: skill.name, start: mark?.start ?? null, end: mark?.end ?? null };
    }),
    note: input.note ?? "",
    clipUrl: clipAllowed(input.photoConsent) ? input.clipUrl : null,
    nextStep: input.nextStep && input.nextStep.published && input.nextStep.futprep ? { name: input.nextStep.name } : null,
  };
}
