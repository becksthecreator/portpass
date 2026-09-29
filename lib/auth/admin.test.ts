import { beforeEach, describe, expect, it, vi } from "vitest";

// adminStepUp() must hand the verify screen the id of the verified TOTP
// factor (02 brief, A1): without it the code box never unlocked for a
// returning admin. Supabase Auth and the cookie jar are stubbed.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const factors = vi.fn();
const aal = vi.fn();
vi.mock("./server", () => ({
  createAuthClient: async () => ({ auth: { mfa: { getAuthenticatorAssuranceLevel: aal, listFactors: factors } } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("./guards", () => ({ hasPlatformRole: () => true, requirePlatformRole: vi.fn(), requireSignedInApi: vi.fn() }));

import { adminStepUp } from "./admin";

beforeEach(() => {
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  aal.mockResolvedValue({ data: { currentLevel: "aal1" } });
});

describe("adminStepUp", () => {
  it("returns the first verified TOTP factor's id", async () => {
    factors.mockResolvedValue({ data: { totp: [{ id: "unverified-1", status: "unverified" }, { id: "verified-1", status: "verified" }, { id: "verified-2", status: "verified" }] } });
    const step = await adminStepUp();
    expect(step.enrolled).toBe(true);
    expect(step.factorId).toBe("verified-1");
    expect(step.aal2).toBe(false);
  });

  it("returns null when nothing is verified", async () => {
    factors.mockResolvedValue({ data: { totp: [{ id: "unverified-1", status: "unverified" }] } });
    const step = await adminStepUp();
    expect(step.enrolled).toBe(false);
    expect(step.factorId).toBeNull();
  });

  it("degrades to signed-out values when Supabase Auth throws", async () => {
    factors.mockRejectedValue(new Error("network"));
    const step = await adminStepUp();
    expect(step).toMatchObject({ aal2: false, enrolled: false, factorId: null, windowOpen: false });
  });
});
