import { describe, expect, it } from "vitest";
import {
  buildPeriodReport,
  channelFromAttribution,
  cleanEventPath,
  commissionForMonth,
  commissionForTerm,
  firstNameOf,
  GROW_WITH_US_OFFER,
  isNudgeWindow,
  isPageEvent,
  missedTwoInARow,
  monthlyReportPeriod,
  monthsInTerm,
  nassauClock,
  termPeriods,
  unmarkedSessions,
  type GrowthAttendance,
  type GrowthPayment,
  type GrowthRegistration,
  type GrowthSession,
  type GrowthTerm,
} from "./growth";

const NONE = { utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, viaPortpass: false };

describe("page events", () => {
  it("accepts only the four events the report counts", () => {
    expect(isPageEvent("view")).toBe(true);
    expect(isPageEvent("register_start")).toBe(true);
    expect(isPageEvent("purchase")).toBe(false);
    expect(isPageEvent(null)).toBe(false);
  });

  it("records only a business's public pages, with nothing personal in the address", () => {
    expect(cleanEventPath("/sports-fitness/futprep-athletics")).toBe("/sports-fitness/futprep-athletics");
    expect(cleanEventPath("/futprep/coaches/?utm_source=portpass#bex")).toBe("/futprep/coaches");
    expect(cleanEventPath("/futprep/register/return/abcDEF123456tokenvalue")).toBe("/futprep/register/return");
    // A status page's address holds a reference code; staff pages are not public.
    expect(cleanEventPath("/futprep/my/FP-ABCD-1234")).toBeNull();
    expect(cleanEventPath("/futprep/my")).toBeNull();
    expect(cleanEventPath("/futprep/staff/coach")).toBeNull();
    // Not this business's pages, or not an address at all.
    expect(cleanEventPath("/weddings")).toBeNull();
    expect(cleanEventPath("/futprep/<script>")).toBeNull();
    expect(cleanEventPath("https://evil.example/futprep")).toBeNull();
    expect(cleanEventPath(42)).toBeNull();
  });

  it("names the source from the attribution cookie, by the same evidence rules as a registration", () => {
    expect(channelFromAttribution(null)).toBe("unknown");
    expect(channelFromAttribution({ ...NONE, utmSource: "portpass", utmMedium: "qr" })).toBe("qr");
    expect(channelFromAttribution({ ...NONE, utmSource: "portpass", utmMedium: "ig_bio" })).toBe("portpass_link");
    expect(channelFromAttribution({ ...NONE, utmSource: "portpass", utmMedium: "member_perk" })).toBe("member_perk");
    expect(channelFromAttribution({ ...NONE, viaPortpass: true })).toBe("portpass_listing");
    expect(channelFromAttribution({ ...NONE, referrerHost: "instagram.com" })).toBe("instagram");
    expect(channelFromAttribution({ ...NONE, referrerHost: "l.instagram.com" })).toBe("instagram");
    expect(channelFromAttribution({ ...NONE, referrerHost: "google.com" })).toBe("google");
    expect(channelFromAttribution({ ...NONE, referrerHost: "wa.me" })).toBe("whatsapp");
    expect(channelFromAttribution({ ...NONE, referrerHost: "somewhere.example" })).toBe("other");
  });
});

describe("Nassau time", () => {
  it("reads the date, weekday and hour in Nassau, not UTC", () => {
    // Saturday 3 October 2026, 12:45 UTC is 8:45 in the morning in Nassau.
    expect(nassauClock(new Date("2026-10-03T12:45:00Z"))).toEqual({ date: "2026-10-03", weekday: 6, hour: 8, minute: 45 });
    // 02:30 UTC on Sunday is still Saturday evening in Nassau.
    expect(nassauClock(new Date("2026-10-04T02:30:00Z"))).toMatchObject({ date: "2026-10-03", weekday: 6, hour: 22 });
    // After the clocks go back (1 November), 13:45 UTC is 8:45.
    expect(nassauClock(new Date("2026-11-07T13:45:00Z"))).toMatchObject({ date: "2026-11-07", weekday: 6, hour: 8, minute: 45 });
  });

  it("nudges only in the morning, and reports only on the 1st", () => {
    expect(isNudgeWindow({ date: "2026-10-03", weekday: 6, hour: 8, minute: 45 })).toBe(true);
    // In winter the first of the two scheduled runs lands at 7:45: too early.
    expect(isNudgeWindow({ date: "2026-11-07", weekday: 6, hour: 7, minute: 45 })).toBe(false);
    expect(isNudgeWindow({ date: "2026-10-03", weekday: 6, hour: 13, minute: 0 })).toBe(false);
    // Saturdays only.
    expect(isNudgeWindow({ date: "2026-10-06", weekday: 2, hour: 8, minute: 45 })).toBe(false);
    expect(monthlyReportPeriod({ date: "2026-11-01", weekday: 0, hour: 6, minute: 0 })).toBe("2026-10");
    expect(monthlyReportPeriod({ date: "2027-01-01", weekday: 5, hour: 6, minute: 0 })).toBe("2026-12");
    expect(monthlyReportPeriod({ date: "2026-11-02", weekday: 1, hour: 6, minute: 0 })).toBeNull();
  });
});

const TERMS: GrowthTerm[] = [
  { id: 1, programId: 10, name: "Term 1", startDate: "2026-09-12", endDate: "2026-12-05", isClass: true },
  { id: 2, programId: 11, name: "Term 1", startDate: "2026-09-12", endDate: "2026-12-05", isClass: true },
  { id: 3, programId: 12, name: "October camp", startDate: "2026-10-13", endDate: "2026-10-16", isClass: false },
  { id: 4, programId: 10, name: "Term 2", startDate: "2027-01-09", endDate: "2027-03-27", isClass: true },
];

describe("this term against last term", () => {
  it("takes the classes running today as the term, and a camp held during it", () => {
    const { current, previous } = termPeriods(TERMS, "2026-10-01");
    expect(current).toEqual({ label: "Term 1", start: "2026-09-12", end: "2026-12-05", termIds: [1, 2, 3] });
    expect(previous).toBeNull();
  });

  it("compares Term 2 with Term 1 once Term 2 is running", () => {
    const { current, previous } = termPeriods(TERMS, "2027-02-01");
    expect(current).toMatchObject({ label: "Term 2", termIds: [4] });
    expect(previous).toMatchObject({ label: "Term 1", termIds: [1, 2, 3] });
  });

  it("between terms, looks ahead to the next one", () => {
    expect(termPeriods(TERMS, "2026-12-20").current).toMatchObject({ label: "Term 2" });
    expect(termPeriods([], "2026-10-01")).toEqual({ current: null, previous: null });
  });

  it("counts a twelve-week term as three months", () => {
    expect(monthsInTerm("2026-09-12", "2026-12-05")).toBe(3);
    expect(monthsInTerm("2026-10-13", "2026-10-16")).toBe(1);
  });
});

function reg(id: number, over: Partial<GrowthRegistration> = {}): GrowthRegistration {
  return { id, programId: 10, termId: 1, status: "confirmed", isNewFamily: false, commissionEligible: false, submittedOn: "2026-09-01", amountDueCents: 42_000, childFirstName: `Child${id}`, ...over };
}
const PROGRAMS = [{ id: 10, name: "Lil Kickers", capacity: 20 }, { id: 11, name: "Kickers", capacity: 16 }];
const PERIOD = { label: "Term 1", start: "2026-09-12", end: "2026-12-05", termIds: [1, 2] };

describe("the term's numbers", () => {
  const registrations = [
    reg(1),
    reg(2, { isNewFamily: true, commissionEligible: true, submittedOn: "2026-09-20" }),
    reg(3, { programId: 11, termId: 2, status: "pending", amountDueCents: 30_000 }),
    reg(4, { status: "waitlist" }),
    reg(5, { status: "trial" }),
    reg(6, { status: "cancelled" }),
    reg(7, { termId: 99 }),
  ];
  const payments: GrowthPayment[] = [
    { id: 1, registrationId: 1, amountCents: 42_000, receivedOn: "2026-09-12" },
    { id: 2, registrationId: 2, amountCents: 20_000, receivedOn: "2026-09-26" },
    { id: 3, registrationId: 6, amountCents: 5_000, receivedOn: "2026-09-12" },
  ];
  const sessions: GrowthSession[] = [
    { id: 1, programId: 10, termId: 1, date: "2026-09-12", status: "scheduled" },
    { id: 2, programId: 10, termId: 1, date: "2026-09-19", status: "scheduled" },
    { id: 3, programId: 10, termId: 1, date: "2026-09-26", status: "scheduled" },
    { id: 4, programId: 10, termId: 1, date: "2026-10-03", status: "scheduled" },
  ];
  const attendance: GrowthAttendance[] = [
    { sessionId: 1, registrationId: 1, status: "present" },
    { sessionId: 3, registrationId: 1, status: "present" },
    { sessionId: 3, registrationId: 2, status: "absent" },
  ];
  const report = buildPeriodReport({
    period: PERIOD, today: "2026-09-30", programs: PROGRAMS, registrations, payments, sessions, attendance, privateRequests: 2,
    events: [
      { event: "view", sourceChannel: "qr", count: 30 },
      { event: "view", sourceChannel: "unknown", count: 70 },
      { event: "whatsapp_click", sourceChannel: "qr", count: 4 },
      { event: "register_click", sourceChannel: "unknown", count: 9 },
      { event: "register_start", sourceChannel: "unknown", count: 6 },
    ],
  });

  it("counts views by source, taps and requests", () => {
    expect(report.found).toEqual({ views: 100, bySource: [{ channel: "unknown", label: "Came straight to the page", views: 70 }, { channel: "qr", label: "PortPass QR code", views: 30 }] });
    expect(report.asked).toEqual({ whatsappTaps: 4, registerClicks: 9, privateRequests: 2 });
  });

  it("counts places taken, new and returning families, and how full each class is", () => {
    expect(report.booked).toMatchObject({ started: 6, completed: 3, newFamilies: 1, returningFamilies: 2, waitlist: 1, tasters: 1 });
    expect(report.booked.classes).toEqual([{ programName: "Kickers", registered: 1, capacity: 16, fillPercent: 6 }, { programName: "Lil Kickers", registered: 2, capacity: 20, fillPercent: 10 }]);
  });

  it("splits fees into due, collected and outstanding, counting only money received for a place", () => {
    expect(report.paid).toMatchObject({ dueCents: 114_000, collectedCents: 62_000, outstandingCents: 52_000 });
    expect(report.paid.classes).toEqual([
      { programName: "Kickers", dueCents: 30_000, collectedCents: 0, outstandingCents: 30_000 },
      { programName: "Lil Kickers", dueCents: 84_000, collectedCents: 62_000, outstandingCents: 22_000 },
    ]);
  });

  it("gives attendance for each Saturday already held, and says when it was not taken", () => {
    // 3 October has not happened yet; a child who joined on the 20th is not expected on the 12th or 19th.
    expect(report.showedUp.sessions).toEqual([
      { date: "2026-09-26", programName: "Lil Kickers", enrolled: 2, present: 1, taken: true, percent: 50 },
      { date: "2026-09-19", programName: "Lil Kickers", enrolled: 1, present: 0, taken: false, percent: null },
      { date: "2026-09-12", programName: "Lil Kickers", enrolled: 1, present: 1, taken: true, percent: 100 },
    ]);
    expect(report.showedUp.averagePercent).toBe(75);
  });

  it("carries a first name and nothing else about a child", () => {
    expect(firstNameOf("  Jayden   Rolle ")).toBe("Jayden");
    expect(firstNameOf("Rolle, Jayden")).toBe("Jayden");
    expect(firstNameOf("Jayden.")).toBe("Jayden");
    expect(firstNameOf("")).toBe("");
    expect(JSON.stringify(report)).not.toMatch(/allerg|medic|emergency|pickup|phone|email/i);
  });
});

describe("children who missed two in a row", () => {
  const sessions: GrowthSession[] = ["2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03"].map((date, i) => ({ id: i + 1, programId: 10, termId: 1, date, status: "scheduled" }));
  const registrations = [reg(1), reg(2), reg(3, { submittedOn: "2026-09-25" }), reg(4, { status: "cancelled" })];

  it("lists a child not marked present at the last two sessions where attendance was taken", () => {
    const attendance: GrowthAttendance[] = [
      // Session 2 (19 Sept): only child 1 came. Session 3 (26 Sept): nobody marked. Session 4 (3 Oct): only child 1 came.
      { sessionId: 2, registrationId: 1, status: "present" },
      { sessionId: 4, registrationId: 1, status: "present" },
      { sessionId: 4, registrationId: 2, status: "excused" },
    ];
    const missed = missedTwoInARow({ today: "2026-10-04", programs: PROGRAMS, registrations, sessions, attendance });
    // Child 2 missed 19 Sept and 3 Oct (26 Sept was not taken, so it is not counted either way).
    // Child 3 joined on 25 Sept and has had only one counted session. Child 4 cancelled.
    expect(missed).toEqual([{ childFirstName: "Child2", programName: "Lil Kickers" }]);
  });

  it("lists nobody when attendance has been taken fewer than twice", () => {
    expect(missedTwoInARow({ today: "2026-10-04", programs: PROGRAMS, registrations, sessions, attendance: [{ sessionId: 4, registrationId: 1, status: "present" }] })).toEqual([]);
  });
});

describe("attendance not marked", () => {
  const sessions: GrowthSession[] = [
    { id: 1, programId: 10, termId: 1, date: "2026-09-26", status: "scheduled" },
    { id: 2, programId: 10, termId: 1, date: "2026-10-03", status: "scheduled" },
    { id: 3, programId: 11, termId: 2, date: "2026-10-03", status: "scheduled" },
    { id: 4, programId: 10, termId: 1, date: "2026-10-10", status: "scheduled" },
    { id: 5, programId: 10, termId: 1, date: "2026-09-05", status: "scheduled" },
  ];
  const registrations = [reg(1)];
  const attendance: GrowthAttendance[] = [{ sessionId: 1, registrationId: 1, status: "present" }];

  it("flags today's session from noon, never before, and never a class with nobody in it", () => {
    const morning = unmarkedSessions({ clock: { date: "2026-10-03", weekday: 6, hour: 11, minute: 59 }, sessions, attendance, registrations });
    expect(morning.map((s) => s.id)).toEqual([]);
    const noon = unmarkedSessions({ clock: { date: "2026-10-03", weekday: 6, hour: 12, minute: 0 }, sessions, attendance, registrations });
    // Session 3 has no children in it; session 5 is more than two weeks old; session 4 is next week.
    expect(noon.map((s) => s.id)).toEqual([2]);
  });
});

describe("Grow With Us commission", () => {
  const registrations = [
    reg(1, { isNewFamily: true, commissionEligible: true }),
    reg(2, { isNewFamily: true, commissionEligible: true }),
    reg(3, { isNewFamily: false, commissionEligible: false }),
    reg(4, { isNewFamily: true, commissionEligible: true, status: "cancelled" }),
  ];

  it("takes 8% of fees collected from commissionable families only, never of fees due", () => {
    const payments: GrowthPayment[] = [
      { id: 1, registrationId: 1, amountCents: 42_000, receivedOn: "2026-09-12" },
      { id: 2, registrationId: 3, amountCents: 42_000, receivedOn: "2026-09-12" },
      { id: 3, registrationId: 4, amountCents: 42_000, receivedOn: "2026-09-12" },
    ];
    const commission = commissionForTerm({ period: PERIOD, registrations, payments, terms: GROW_WITH_US_OFFER });
    // Family 2 owes $420 and has paid nothing: nothing is charged on it.
    expect(commission).toMatchObject({ families: 1, collectedCents: 42_000, uncappedFeeCents: 3_360, feeCents: 3_360, capCents: 36_000, capApplied: false });
  });

  it("stops at the term's cap of $360, in the order the money came in", () => {
    const payments: GrowthPayment[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, registrationId: i % 2 === 0 ? 1 : 2, amountCents: 42_000, receivedOn: `2026-${i < 6 ? "10" : "11"}-${String(i + 1).padStart(2, "0")}` }));
    const commission = commissionForTerm({ period: PERIOD, registrations, payments, terms: GROW_WITH_US_OFFER });
    // 12 payments of $420 at 8% would be $403.20; the cap is $360.
    expect(commission).toMatchObject({ families: 2, collectedCents: 504_000, uncappedFeeCents: 40_320, feeCents: 36_000, capCents: 36_000, capApplied: true });
    expect(commission.lines.slice(-2).map((l) => l.feeCents)).toEqual([2_400, 0]);
    // By month: October's six payments, then November's up to the cap.
    expect(commissionForMonth(commission, "2026-10")).toEqual({ families: 2, collectedCents: 252_000, feeCents: 20_160 });
    expect(commissionForMonth(commission, "2026-11")).toEqual({ families: 2, collectedCents: 252_000, feeCents: 15_840 });
    expect(commissionForMonth(commission, "2026-12")).toEqual({ families: 0, collectedCents: 0, feeCents: 0 });
  });
});
