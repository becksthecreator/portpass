import { describe, expect, it } from "vitest";
import { canSeePassport } from "./access";

// Brief 31 (D): a coach sees only their own players' passports.
const A = 11;
const B = 12;
const term = { leadCoachId: A };
const ledByB = { leadCoachId: B };
const noLead = { leadCoachId: null };

describe("who sees a child's passport (brief 31, D)", () => {
  it("a coach sees the children of the classes they lead, never another coach's, nor a class with no lead", () => {
    expect(canSeePassport({ role: "coach", coachId: A }, noLead)).toBe(false);
    expect(canSeePassport({ role: "coach", coachId: A }, term)).toBe(true);
    expect(canSeePassport({ role: "coach", coachId: B }, ledByB)).toBe(true);
    expect(canSeePassport({ role: "coach", coachId: B }, term)).toBe(false);
    expect(canSeePassport({ role: "coach", coachId: A }, ledByB)).toBe(false);
  });

  it("the CEO and admins see every passport", () => {
    for (const role of ["ceo", "admin"] as const) {
      expect(canSeePassport({ role, coachId: null }, term)).toBe(true);
      expect(canSeePassport({ role, coachId: null }, ledByB)).toBe(true);
    }
  });

  it("a helper, a coach login with no profile and a signed-out viewer see none", () => {
    expect(canSeePassport({ role: "helper", coachId: A }, term)).toBe(false);
    expect(canSeePassport({ role: "coach", coachId: null }, term)).toBe(false);
    expect(canSeePassport({ role: null, coachId: A }, term)).toBe(false);
  });
});
