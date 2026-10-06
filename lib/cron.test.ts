import { afterEach, describe, expect, it, vi } from "vitest";
import { cronGate } from "./cron";

const SECRET = "cron-test-value-not-real-0123456789";
const call = (authorization?: string) => new Request("https://portpass.test/api/cron/daily", { headers: authorization ? { authorization } : {} });

describe("cronGate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses every call with 503 while CRON_SECRET is unset, in every environment, and logs the name only", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const env of [{}, { CRON_SECRET: "   " }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: "production" }]) {
      expect(cronGate(call(`Bearer ${SECRET}`), env)).toEqual({ ok: false, status: 503, error: "Not set up." });
    }
    expect(error).toHaveBeenCalledTimes(5);
    const logged = error.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("/api/cron/daily: CRON_SECRET is not set");
    expect(logged).not.toContain(SECRET);
  });

  it("refuses a call without the secret, or with the wrong one, with 401", () => {
    const env = { CRON_SECRET: SECRET, VERCEL_ENV: "production" };
    expect(cronGate(call(), env)).toEqual({ ok: false, status: 401, error: "Not allowed." });
    expect(cronGate(call("Bearer "), env)).toEqual({ ok: false, status: 401, error: "Not allowed." });
    expect(cronGate(call(`Bearer ${SECRET.slice(0, -1)}`), env)).toEqual({ ok: false, status: 401, error: "Not allowed." });
    expect(cronGate(call(`Bearer ${SECRET}x`), env)).toEqual({ ok: false, status: 401, error: "Not allowed." });
    expect(cronGate(call(SECRET), env)).toEqual({ ok: false, status: 401, error: "Not allowed." });
    expect(cronGate(call(`Basic ${SECRET}`), env)).toEqual({ ok: false, status: 401, error: "Not allowed." });
  });

  it("lets the call through with the right bearer token, however the scheme is capitalised", () => {
    const env = { CRON_SECRET: ` ${SECRET} ` };
    expect(cronGate(call(`Bearer ${SECRET}`), env)).toEqual({ ok: true });
    expect(cronGate(call(`bearer ${SECRET}`), env)).toEqual({ ok: true });
  });
});
