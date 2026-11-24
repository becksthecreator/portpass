import { describe, expect, it } from "vitest";
import { buildThisWeek, businessHref, clockTime, previewText, type HomeRegistrationRow } from "./parentHome";

const TODAY = "2026-11-24";
const reg = (over: Partial<HomeRegistrationRow> = {}): HomeRegistrationRow => ({
  reference: "FP-TEST-0001", organizationId: 1, programId: 10, termId: 20, childName: "TEST Ava Rolle",
  status: "confirmed", paymentStatus: "unpaid", amountDueCents: 30000, trialSessionId: null, ...over,
});
const base = {
  today: TODAY,
  programs: [{ id: 10, name: "TEST Lil Kickers", location: "TEST Field", locationNote: "By the gate", endTime: "10:00:00" }],
  businesses: [{ id: 1, name: "TEST Football", slug: "test-football", category: "sports-fitness", websiteUrl: "https://www.example.com/" }],
  posts: [],
  statusHref: () => "/futprep/my",
};
const session = (id: number, date: string, status = "scheduled") => ({ id, programId: 10, termId: 20, date, startTime: "09:00:00", location: null, status });

describe("the parent's this-week card", () => {
  it("shows the next session still running, its time and place, what's owed and the way back", () => {
    const [card] = buildThisWeek({ ...base, registrations: [reg()], sessions: [session(1, "2026-11-21"), session(3, "2026-12-05"), session(2, "2026-11-28")] });
    expect(card).toMatchObject({
      childFirstName: "TEST",
      className: "TEST Lil Kickers",
      next: { date: "2026-11-28", time: "9:00 AM–10:00 AM", place: "TEST Field", placeNote: "By the gate" },
      owed: { label: "To pay", amountCents: 30000 },
      businessHref: "https://www.example.com/",
      statusHref: "/futprep/my",
    });
  });

  it("skips a cancelled session, so a rained-off Saturday shows the next real one", () => {
    const [card] = buildThisWeek({ ...base, registrations: [reg()], sessions: [session(2, "2026-11-28", "cancelled"), session(3, "2026-12-05")] });
    expect(card.next?.date).toBe("2026-12-05");
  });

  it("shows the coaches' latest update, shortened", () => {
    const posts = [
      { programId: 10, termId: 20, body: "Older post", authorName: "TEST Coach", createdAt: "2026-11-20T10:00:00Z" },
      { programId: 10, termId: 20, body: "No class this Saturday because of the rain. ".repeat(6), authorName: "TEST Coach", createdAt: "2026-11-23T10:00:00Z" },
      { programId: 99, termId: 20, body: "Another class", authorName: "TEST Coach", createdAt: "2026-11-24T10:00:00Z" },
    ];
    const [card] = buildThisWeek({ ...base, registrations: [reg()], sessions: [session(2, "2026-11-28")], posts });
    expect(card.latest?.body.startsWith("No class this Saturday")).toBe(true);
    expect(card.latest!.body.length).toBeLessThanOrEqual(160);
    expect(card.latest!.body.endsWith("…")).toBe(true);
  });

  it("shows a registration still waiting to be confirmed no class update, as /futprep/feed doesn't", () => {
    const posts = [{ programId: 10, termId: 20, body: "TEST update", authorName: "TEST Coach", createdAt: "2026-11-23T10:00:00Z" }];
    const [card] = buildThisWeek({ ...base, registrations: [reg({ status: "pending" })], sessions: [session(2, "2026-11-28")], posts });
    expect(card.latest).toBeNull();
    expect(card.next?.date).toBe("2026-11-28");
  });

  it("owes nothing when paid, waived or a free taster; part paid says so", () => {
    const sessions = [session(2, "2026-11-28")];
    expect(buildThisWeek({ ...base, registrations: [reg({ paymentStatus: "paid" })], sessions })[0].owed).toBeNull();
    expect(buildThisWeek({ ...base, registrations: [reg({ paymentStatus: "waived" })], sessions })[0].owed).toBeNull();
    expect(buildThisWeek({ ...base, registrations: [reg({ status: "trial", trialSessionId: 2 })], sessions })[0].owed).toBeNull();
    expect(buildThisWeek({ ...base, registrations: [reg({ paymentStatus: "partial" })], sessions })[0].owed).toEqual({ label: "Part paid", amountCents: 30000 });
  });

  it("gives a taster only its own session", () => {
    const sessions = [session(2, "2026-11-28"), session(3, "2026-12-05")];
    expect(buildThisWeek({ ...base, registrations: [reg({ status: "trial", trialSessionId: 3 })], sessions })[0].next?.date).toBe("2026-12-05");
  });

  it("leaves out waitlisted, cancelled and finished classes", () => {
    const sessions = [session(1, "2026-11-21")];
    expect(buildThisWeek({ ...base, registrations: [reg({ status: "waitlist" }), reg({ status: "cancelled" })], sessions: [session(2, "2026-11-28")] })).toEqual([]);
    expect(buildThisWeek({ ...base, registrations: [reg()], sessions })).toEqual([]);
  });

  it("puts the soonest class first", () => {
    const sessions = [session(2, "2026-11-28"), { ...session(5, "2026-11-25"), programId: 11 }];
    const programs = [...base.programs, { id: 11, name: "TEST Kickers", location: "TEST Gym", locationNote: null, endTime: null }];
    const cards = buildThisWeek({ ...base, programs, registrations: [reg(), reg({ reference: "FP-TEST-0002", programId: 11, childName: "TEST Ben" })], sessions });
    expect(cards.map((c) => c.className)).toEqual(["TEST Kickers", "TEST Lil Kickers"]);
    expect(cards[0].next?.time).toBe("9:00 AM");
  });
});

describe("the small helpers", () => {
  it("formats a clock time", () => {
    expect(clockTime("09:00:00")).toBe("9:00 AM");
    expect(clockTime("12:30")).toBe("12:30 PM");
    expect(clockTime("00:15")).toBe("12:15 AM");
    expect(clockTime(null)).toBe("");
  });

  it("links only a real web address, else the business's PortPass page", () => {
    const b = { id: 1, name: "TEST", slug: "test", category: "sports-fitness", websiteUrl: null as string | null };
    expect(businessHref({ ...b, websiteUrl: "javascript:alert(1)" })).toBe("/sports-fitness/test");
    expect(businessHref({ ...b, websiteUrl: "https://www.example.com/" })).toBe("https://www.example.com/");
    expect(businessHref(b)).toBe("/sports-fitness/test");
    expect(businessHref(undefined)).toBeNull();
  });

  it("keeps a short update as it is", () => {
    expect(previewText("  See you\n Saturday ")).toBe("See you Saturday");
  });
});
