import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_SESSION_MAX_AGE_SECONDS, demoTokenOrganization, issueDemoToken } from "./demoSession";

const NOW = 1_800_000_000_000;
let before: string | undefined;

beforeEach(() => {
  before = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = "unit-test-secret-not-real";
});

afterEach(() => {
  if (before === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = before;
});

describe("the demo session token", () => {
  it("names the business it was issued for, and nothing else reads as that", () => {
    const token = issueDemoToken(42, NOW)!;
    expect(token).toMatch(/^42\.\d{10}\.[\w-]+$/);
    expect(demoTokenOrganization(token, NOW)).toBe(42);
    expect(demoTokenOrganization(token, NOW + 60_000)).toBe(42);
  });

  it("can't be moved to another business", () => {
    const token = issueDemoToken(42, NOW)!;
    const [, issued, mac] = token.split(".");
    expect(demoTokenOrganization(`7.${issued}.${mac}`, NOW)).toBeNull();
    expect(demoTokenOrganization(`42.${Number(issued) + 1}.${mac}`, NOW)).toBeNull();
    expect(demoTokenOrganization(`42.${issued}.${mac.slice(0, -2)}xx`, NOW)).toBeNull();
  });

  it("ends after two hours, and a token from the future is refused", () => {
    const token = issueDemoToken(42, NOW)!;
    expect(demoTokenOrganization(token, NOW + DEMO_SESSION_MAX_AGE_SECONDS * 1000)).toBe(42);
    expect(demoTokenOrganization(token, NOW + (DEMO_SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
    expect(demoTokenOrganization(issueDemoToken(42, NOW + 10 * 60_000)!, NOW)).toBeNull();
  });

  it("is refused when it was signed with another secret", () => {
    const token = issueDemoToken(42, NOW)!;
    process.env.SUPABASE_SECRET_KEY = "another-secret-not-real";
    expect(demoTokenOrganization(token, NOW)).toBeNull();
  });

  it("is never issued, or accepted, without a server secret", () => {
    const token = issueDemoToken(42, NOW)!;
    delete process.env.SUPABASE_SECRET_KEY;
    expect(issueDemoToken(42, NOW)).toBeNull();
    expect(demoTokenOrganization(token, NOW)).toBeNull();
  });

  it("refuses anything that isn't a token", () => {
    for (const bad of [undefined, null, "", "42", "42.1800000000", "a.b.c", "0.1800000000.x", "-1.1800000000.x", "42.18.x", "42.1800000000.", "42.1800000000.x.y"]) expect(demoTokenOrganization(bad, NOW)).toBeNull();
    expect(issueDemoToken(0, NOW)).toBeNull();
    expect(issueDemoToken(1.5, NOW)).toBeNull();
  });
});
