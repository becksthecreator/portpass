import { describe, expect, it } from "vitest";
import { acceptingCoachId, canActOnRequest, canSeeRequest, inboxFor } from "./privateSessionAccess";

// Brief 31 (C1): a coach sees only their own requests.
const A = 11;
const B = 12;
const requests = [
  { id: 1, preferred_coach_id: A, assigned_coach_id: null, notes: "TEST note one" },
  { id: 2, preferred_coach_id: B, assigned_coach_id: null, notes: "TEST note two" },
  { id: 3, preferred_coach_id: A, assigned_coach_id: B, notes: "TEST referred" },
  { id: 4, preferred_coach_id: null, assigned_coach_id: null, notes: "TEST any coach" },
];

describe("who sees which private-session request (brief 31, C1)", () => {
  it("the CEO and admin logins see every request, notes included", () => {
    for (const role of ["ceo", "admin"] as const) {
      expect(inboxFor({ role, coachId: null }, requests).map((r) => r.id)).toEqual([1, 2, 3, 4]);
      expect(inboxFor({ role, coachId: null }, requests)[0].notes).toBe("TEST note one");
    }
  });

  it("a coach sees the requests where they are preferred or assigned, and never another coach's", () => {
    expect(inboxFor({ role: "coach", coachId: A }, requests).map((r) => r.id)).toEqual([1, 3]);
    expect(inboxFor({ role: "coach", coachId: B }, requests).map((r) => r.id)).toEqual([2, 3]);
    expect(canSeeRequest({ role: "coach", coachId: A }, requests[1])).toBe(false);
  });

  it("an 'any coach' request is the desk's until it is given to a coach", () => {
    expect(canSeeRequest({ role: "coach", coachId: A }, requests[3])).toBe(false);
    expect(canSeeRequest({ role: "admin", coachId: null }, requests[3])).toBe(true);
  });

  it("a coach login with no profile, a helper and a signed-out viewer see nothing", () => {
    expect(inboxFor({ role: "coach", coachId: null }, requests)).toEqual([]);
    expect(inboxFor({ role: "helper", coachId: A }, requests)).toEqual([]);
    expect(inboxFor({ role: null, coachId: A }, requests)).toEqual([]);
  });

  it("a coach gets the request without the parent's free-text notes", () => {
    expect(inboxFor({ role: "coach", coachId: A }, requests).every((r) => r.notes === "")).toBe(true);
  });

  it("only the coach a request is with now may act on it; the one it was referred from only sees it", () => {
    // Request 3: chosen coach A, referred to and assigned to B.
    expect(canSeeRequest({ role: "coach", coachId: A }, requests[2])).toBe(true);
    expect(canActOnRequest({ role: "coach", coachId: A }, requests[2])).toBe(false);
    expect(canActOnRequest({ role: "coach", coachId: B }, requests[2])).toBe(true);
    expect(canActOnRequest({ role: "coach", coachId: A }, requests[0])).toBe(true);
    expect(canActOnRequest({ role: "coach", coachId: A }, requests[3])).toBe(false);
    expect(canActOnRequest({ role: "admin", coachId: null }, requests[3])).toBe(true);
    expect(canActOnRequest({ role: "helper", coachId: B }, requests[2])).toBe(false);
  });

  it("the parent's notes reach only a login with the medical view", () => {
    expect(inboxFor({ role: "admin", coachId: null, canViewNotes: false }, requests).every((r) => r.notes === "")).toBe(true);
    expect(inboxFor({ role: "admin", coachId: null, canViewNotes: true }, requests)[0].notes).toBe("TEST note one");
  });

  it("a coach accepts as themselves, whatever coach the request names; the desk chooses", () => {
    expect(acceptingCoachId({ role: "coach", coachId: A }, B)).toBe(A);
    expect(acceptingCoachId({ role: "admin", coachId: null }, B)).toBe(B);
  });
});
