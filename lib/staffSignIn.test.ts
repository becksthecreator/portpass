import { beforeEach, describe, expect, it, vi } from "vitest";

// The staff PIN sign-in limits (lib/staffSignIn.ts) with the attempt store
// faked: a locked account is refused before the PIN is even checked, a
// wrong PIN is counted, a right one clears the count, and one address gets
// a bounded number of tries.
const store = vi.hoisted(() => ({ failures: new Map<string, number>() }));

vi.mock("@/db/staffLoginAttempts", () => ({
  STAFF_LOGIN_WINDOW_MINUTES: 15,
  staffLoginLocked: vi.fn(async (area: string, key: string) => (store.failures.get(`${area}:${key}`) ?? 0) >= 5),
  recordStaffLoginFailure: vi.fn(async (area: string, key: string) => {
    store.failures.set(`${area}:${key}`, (store.failures.get(`${area}:${key}`) ?? 0) + 1);
  }),
  clearStaffLoginFailures: vi.fn(async (area: string, key: string) => {
    store.failures.delete(`${area}:${key}`);
  }),
}));

import { staffSignIn } from "./staffSignIn";

let address = 0;
function attempt(accountKey: unknown, pin: unknown, ip?: string) {
  address += 1;
  return new Request("http://localhost/api/futprep/staff/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip ?? `10.0.${Math.floor(address / 250)}.${address % 250}` },
    body: JSON.stringify({ accountKey, pin }),
  });
}

const RIGHT_PIN = "482913";
const makeToken = vi.fn(async (accountKey: string, pin: string) => (pin === RIGHT_PIN ? `${accountKey}.coach.signature` : null));

beforeEach(() => {
  store.failures.clear();
  makeToken.mockClear();
});

describe("staff PIN sign-in limits", () => {
  it("signs in with the right PIN and normalises the account name", async () => {
    const result = await staffSignIn(attempt("  Bex ", RIGHT_PIN), "futprep", makeToken);
    expect(result).toEqual({ ok: true, accountKey: "bex", token: "bex.coach.signature" });
  });

  it("locks the account after five wrong PINs, and then refuses even the right one without checking it", async () => {
    for (let i = 0; i < 5; i += 1) {
      const wrong = await staffSignIn(attempt("bex", "000000"), "futprep", makeToken);
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) expect(wrong.response.status).toBe(401);
    }
    makeToken.mockClear();
    const locked = await staffSignIn(attempt("bex", RIGHT_PIN), "futprep", makeToken);
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.response.status).toBe(429);
      expect(locked.response.headers.get("Retry-After")).toBe("900");
      expect((await locked.response.json()).error).toMatch(/Too many wrong attempts/);
    }
    expect(makeToken).not.toHaveBeenCalled();
  });

  it("counts per account and per staff area", async () => {
    for (let i = 0; i < 5; i += 1) await staffSignIn(attempt("bex", "000000"), "futprep", makeToken);
    expect((await staffSignIn(attempt("alex", RIGHT_PIN), "futprep", makeToken)).ok).toBe(true);
    expect((await staffSignIn(attempt("bex", RIGHT_PIN), "weddings", makeToken)).ok).toBe(true);
  });

  it("clears the count on a correct PIN", async () => {
    for (let i = 0; i < 4; i += 1) await staffSignIn(attempt("bex", "000000"), "futprep", makeToken);
    expect((await staffSignIn(attempt("bex", RIGHT_PIN), "futprep", makeToken)).ok).toBe(true);
    expect(store.failures.get("futprep:bex")).toBeUndefined();
  });

  it("limits one address to 20 tries, whatever account names it uses", async () => {
    const ip = "203.0.113.9";
    let last = await staffSignIn(attempt("name-0", "000000", ip), "futprep", makeToken);
    for (let i = 1; i <= 20; i += 1) last = await staffSignIn(attempt(`name-${i}`, "000000", ip), "futprep", makeToken);
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.response.status).toBe(429);
  });

  it("asks for an account name, and treats a null body as none", async () => {
    const empty = await staffSignIn(attempt("", RIGHT_PIN), "futprep", makeToken);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.response.status).toBe(400);
    const nullBody = await staffSignIn(new Request("http://localhost/x", { method: "POST", body: "null" }), "futprep", makeToken);
    expect(nullBody.ok).toBe(false);
    if (!nullBody.ok) expect(nullBody.response.status).toBe(400);
  });
});
