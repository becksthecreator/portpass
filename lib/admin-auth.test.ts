import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminAccessConfigured, makeAdminToken, verifyAdminToken } from "./admin-auth";

const ORIGINAL_PIN = process.env.PORTPASS_ADMIN_PIN;

describe("admin token signing", () => {
  beforeEach(() => {
    process.env.PORTPASS_ADMIN_PIN = "4242";
  });

  afterEach(() => {
    if (ORIGINAL_PIN === undefined) delete process.env.PORTPASS_ADMIN_PIN;
    else process.env.PORTPASS_ADMIN_PIN = ORIGINAL_PIN;
  });

  it("reports access configured once a PIN is set", () => {
    expect(adminAccessConfigured()).toBe(true);
  });

  it("reports access not configured when the PIN is blank", () => {
    process.env.PORTPASS_ADMIN_PIN = "   ";
    expect(adminAccessConfigured()).toBe(false);
  });

  it("mints no token for the wrong PIN", async () => {
    expect(await makeAdminToken("0000")).toBeNull();
  });

  it("a token minted for the correct PIN verifies", async () => {
    const token = await makeAdminToken("4242");
    expect(token).not.toBeNull();
    expect(await verifyAdminToken(token)).toBe(true);
  });

  it("a tampered token fails verification", async () => {
    const token = await makeAdminToken("4242");
    const tampered = `${token!.slice(0, -1)}${token!.at(-1) === "a" ? "b" : "a"}`;
    expect(await verifyAdminToken(tampered)).toBe(false);
  });

  it("a token signed under a different PIN fails once the PIN rotates", async () => {
    const token = await makeAdminToken("4242");
    process.env.PORTPASS_ADMIN_PIN = "9999";
    expect(await verifyAdminToken(token)).toBe(false);
  });

  it("an empty or missing token fails", async () => {
    expect(await verifyAdminToken("")).toBe(false);
    expect(await verifyAdminToken(undefined)).toBe(false);
    expect(await verifyAdminToken(null)).toBe(false);
  });

  it("no token verifies when the PIN is not configured at all", async () => {
    const token = await makeAdminToken("4242");
    delete process.env.PORTPASS_ADMIN_PIN;
    expect(await verifyAdminToken(token)).toBe(false);
  });
});
