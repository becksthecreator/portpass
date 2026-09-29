// What the two-step form can do, given what it has (02 brief, A1). Kept
// pure so the "a returning admin with a factor can submit" rule is
// unit-tested without rendering.
export type VerifyMode = "enroll" | "challenge";

export function verifyState(input: { mode: VerifyMode; factorId: string | null; code: string; busy: boolean }) {
  const hasFactor = Boolean(input.factorId);
  const missingFactor = input.mode === "challenge" && !hasFactor;
  return {
    missingFactor,
    inputDisabled: !hasFactor,
    submitDisabled: input.busy || !hasFactor || input.code.length !== 6,
    missingFactorMessage: missingFactor ? "We couldn't find your authenticator. Sign out and back in, or ask the platform owner to reset two-step login." : null,
  };
}
