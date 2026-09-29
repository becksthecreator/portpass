import { describe, expect, it } from "vitest";
import { verifyState } from "./verifyState";

describe("two-step form state (02 brief, A1)", () => {
  it("a returning admin with a verified factor can type and submit a code", () => {
    const s = verifyState({ mode: "challenge", factorId: "f-1", code: "123456", busy: false });
    expect(s.inputDisabled).toBe(false);
    expect(s.submitDisabled).toBe(false);
    expect(s.missingFactor).toBe(false);
  });

  it("challenge mode without a factor explains itself instead of a dead input", () => {
    const s = verifyState({ mode: "challenge", factorId: null, code: "", busy: false });
    expect(s.missingFactor).toBe(true);
    expect(s.missingFactorMessage).toMatch(/couldn't find your authenticator/);
    expect(s.inputDisabled).toBe(true);
  });

  it("enrolment waits for the factor without calling it missing", () => {
    const s = verifyState({ mode: "enroll", factorId: null, code: "", busy: false });
    expect(s.missingFactor).toBe(false);
    expect(s.inputDisabled).toBe(true);
  });
});
