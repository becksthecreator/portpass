import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueStaffToken, readStaffToken, STAFF_SESSION_MAX_AGE_SECONDS, staffTokenValid } from "./staffSession";

// The staff session cookie: only a token this server signed, for this
// staff area and this account as it is now, within 8 hours, is accepted.
const PIN_HASH = createHash("sha256").update("482913").digest("hex");
const ACCOUNT = { accountKey: "bex", role: "coach", pinHash: PIN_HASH };
const NOW = Date.UTC(2026, 9, 3, 14, 0, 0);
let before: string | undefined;

beforeAll(() => {
  before = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = "unit-test-secret-not-a-real-key";
});

afterAll(() => {
  if (before === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = before;
});

function valid(token: string | null, account = ACCOUNT, area: "futprep" | "weddings" = "futprep", now = NOW): boolean {
  const parts = readStaffToken(token);
  return parts !== null && staffTokenValid(area, parts, account, now);
}

describe("staff session tokens", () => {
  it("accepts a token it issued, and reads the account and role from it", () => {
    const token = issueStaffToken("futprep", ACCOUNT, NOW);
    expect(token).toMatch(/^bex\.coach\.\d{10}\.[A-Za-z0-9_-]{43}$/);
    expect(readStaffToken(token)).toMatchObject({ accountKey: "bex", role: "coach" });
    expect(valid(token)).toBe(true);
  });

  it("refuses the old unsigned format, even though anyone holding the PIN hash can compute it", () => {
    const oldStyle = createHash("sha256").update(`portpass:futprep:bex:coach:${PIN_HASH}`).digest("hex");
    expect(readStaffToken(`bex.coach.${oldStyle}`)).toBeNull();
    // ...and dressing it up in the new shape doesn't help without the secret.
    expect(valid(`bex.coach.${Math.floor(NOW / 1000)}.${oldStyle}`)).toBe(false);
  });

  it("refuses a token whose account, role or date was edited", () => {
    const token = issueStaffToken("futprep", ACCOUNT, NOW)!;
    const [account, role, issued, mac] = token.split(".");
    expect(valid(`alex.${role}.${issued}.${mac}`, { ...ACCOUNT, accountKey: "alex" })).toBe(false);
    expect(valid(`${account}.ceo.${issued}.${mac}`, { ...ACCOUNT, role: "ceo" })).toBe(false);
    expect(valid(`${account}.${role}.${Number(issued) + 3600}.${mac}`)).toBe(false);
    expect(valid(`${account}.${role}.${issued}.${mac.slice(0, -1)}A`)).toBe(false);
  });

  it("is tied to one staff area", () => {
    const token = issueStaffToken("futprep", ACCOUNT, NOW);
    expect(valid(token, ACCOUNT, "weddings")).toBe(false);
  });

  it("stops working when the role or the PIN changes", () => {
    const token = issueStaffToken("futprep", ACCOUNT, NOW);
    expect(valid(token, { ...ACCOUNT, role: "helper" })).toBe(false);
    expect(valid(token, { ...ACCOUNT, pinHash: createHash("sha256").update("111111").digest("hex") })).toBe(false);
  });

  it("expires on the server after 8 hours, and rejects a date from the future", () => {
    const token = issueStaffToken("futprep", ACCOUNT, NOW);
    expect(valid(token, ACCOUNT, "futprep", NOW + (STAFF_SESSION_MAX_AGE_SECONDS - 60) * 1000)).toBe(true);
    expect(valid(token, ACCOUNT, "futprep", NOW + (STAFF_SESSION_MAX_AGE_SECONDS + 60) * 1000)).toBe(false);
    expect(valid(token, ACCOUNT, "futprep", NOW - 10 * 60 * 1000)).toBe(false);
  });

  it("issues nothing, and accepts nothing, without a server secret", () => {
    const token = issueStaffToken("futprep", ACCOUNT, NOW);
    const saved = process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    try {
      expect(issueStaffToken("futprep", ACCOUNT, NOW)).toBeNull();
      expect(valid(token)).toBe(false);
    } finally {
      process.env.SUPABASE_SECRET_KEY = saved;
    }
  });

  it("rejects malformed cookie values", () => {
    for (const value of [null, undefined, "", "bex", "bex.coach", "bex.coach.123.abc", "bex.coach.notanumber.abc", "a.b.c.d.e"]) {
      expect(readStaffToken(value)).toBeNull();
    }
  });
});
