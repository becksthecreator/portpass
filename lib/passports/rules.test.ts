import { describe, expect, it } from "vitest";
import { bandFor, canShare, cleanClipUrl, cleanNote, clipAllowed, markWindows, parentPassportView, validScore } from "./rules";

// Brief 31 (D): the Progress Passport's rules, pure.

describe("which skills a child is scored on", () => {
  it("gives Lil Kickers under 4 on the term's first day the early-years skills, everyone else football", () => {
    expect(bandFor("2022-10-01", "2026-09-26")).toBe("lil_kickers"); // 47 months
    expect(bandFor("2022-09-26", "2026-09-26")).toBe("football"); // 48 months
    expect(bandFor(null, "2026-09-26")).toBe("football");
  });
});

describe("when a coach may score", () => {
  // Saturdays: a taster on 19 Sep, then 26 Sep to 12 Dec, with 7 Nov cancelled.
  const saturdays = ["2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12"];
  const sessions = saturdays.map((date) => ({ date, cancelled: date === "2026-11-07" }));
  const term = (today: string) => markWindows({ sessions, tasterDate: "2026-09-19", programType: "term", today });

  it("opens start marks in week 1, counted from the first session after the taster", () => {
    expect(term("2026-09-19")).toMatchObject({ start: false, end: false });
    expect(term("2026-09-26")).toMatchObject({ start: true, end: false });
    expect(term("2026-10-02")).toMatchObject({ start: true });
    expect(term("2026-10-03")).toMatchObject({ start: false });
  });

  it("opens end marks in the last two weeks, and for a week after the last session", () => {
    expect(term("2026-11-28")).toMatchObject({ end: false });
    expect(term("2026-12-05")).toMatchObject({ end: true, start: false });
    expect(term("2026-12-19")).toMatchObject({ end: true });
    expect(term("2026-12-20")).toMatchObject({ end: false });
  });

  it("a camp opens both for the whole camp", () => {
    const camp = (today: string) => markWindows({ sessions: ["2026-12-21", "2026-12-22", "2026-12-23"].map((date) => ({ date, cancelled: false })), tasterDate: null, programType: "camp", today });
    expect(camp("2026-12-21")).toMatchObject({ start: true, end: true });
    expect(camp("2026-12-23")).toMatchObject({ start: true, end: true });
    expect(camp("2026-12-24")).toMatchObject({ start: false, end: true });
  });

  it("with no sessions nothing opens", () => {
    expect(markWindows({ sessions: [], tasterDate: null, programType: "term", today: "2026-10-01" })).toMatchObject({ start: false, end: false });
  });
});

describe("what a mark, a note and a clip may be", () => {
  it("takes a mark only as a whole number from 1 to 5", () => {
    for (const ok of [1, 3, 5]) expect(validScore(ok)).toBe(true);
    for (const bad of [0, 6, 2.5, "3", Number.NaN, null]) expect(validScore(bad)).toBe(false);
  });

  it("keeps a note to 500 characters", () => {
    expect(cleanNote("x".repeat(500))).toEqual({ ok: true, value: "x".repeat(500) });
    expect(cleanNote("x".repeat(501))).toEqual({ ok: false });
    expect(cleanNote("   ")).toEqual({ ok: true, value: "" });
    expect(cleanNote(5)).toEqual({ ok: false });
  });

  it("takes a clip link only over https, from the allowed hosts", () => {
    expect(cleanClipUrl("https://youtu.be/abc")).toEqual({ ok: true, value: "https://youtu.be/abc" });
    expect(cleanClipUrl("https://www.youtube.com/watch?v=abc").ok).toBe(true);
    expect(cleanClipUrl("")).toEqual({ ok: true, value: null });
    for (const bad of ["http://youtu.be/abc", "javascript:alert(1)", "data:text/html,x", "https://youtu.be@evil.example/x", "https://youtu.be.evil.example/x", "https://evil.example/youtu.be", `https://youtu.be/${"a".repeat(2050)}`]) {
      expect(cleanClipUrl(bad)).toEqual({ ok: false });
    }
  });

  it("allows a clip only with photo permission yes", () => {
    expect(clipAllowed("yes")).toBe(true);
    expect(clipAllowed("no")).toBe(false);
    expect(clipAllowed(null)).toBe(false);
  });
});

describe("sharing and what a family sees", () => {
  const skills = [{ id: 1, name: "Passing" }, { id: 2, name: "Shooting" }];
  const marks = [{ skillId: 1, start: 2, end: 4 }, { skillId: 2, start: 3, end: null }];
  const shared = {
    status: "shared" as const, childName: "TEST Child Name", programName: "TEST Kickers", termName: "TEST Term", sharedAt: "2026-12-13T12:00:00Z",
    skills, marks, note: "TEST great term", clipUrl: "https://youtu.be/abc", photoConsent: "yes",
    nextStep: { name: "TEST Private session · 30 min", published: true, futprep: true },
  };

  it("shares only once every skill has an end mark", () => {
    expect(canShare(skills, marks)).toBe(false);
    expect(canShare(skills, [...marks.slice(0, 1), { skillId: 2, start: 3, end: 5 }])).toBe(true);
    expect(canShare([], [])).toBe(false);
  });

  it("gives a family nothing before it is shared", () => {
    expect(parentPassportView({ ...shared, status: "draft" })).toBeNull();
  });

  it("gives the marks, the note, a first name, and nothing else", () => {
    const view = parentPassportView(shared)!;
    expect(view).toEqual({
      childFirstName: "TEST", programName: "TEST Kickers", termName: "TEST Term", sharedAt: "2026-12-13T12:00:00Z",
      skills: [{ name: "Passing", start: 2, end: 4 }, { name: "Shooting", start: 3, end: null }],
      note: "TEST great term", clipUrl: "https://youtu.be/abc", nextStep: { name: "TEST Private session · 30 min" },
    });
  });

  it("drops the clip without photo permission, and a next step that isn't Futprep's published offering", () => {
    expect(parentPassportView({ ...shared, photoConsent: "no" })!.clipUrl).toBeNull();
    expect(parentPassportView({ ...shared, nextStep: { ...shared.nextStep, published: false } })!.nextStep).toBeNull();
    expect(parentPassportView({ ...shared, nextStep: { ...shared.nextStep, futprep: false } })!.nextStep).toBeNull();
  });
});
