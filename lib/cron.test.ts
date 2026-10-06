import { afterEach, describe, expect, it, vi } from "vitest";
import { cronGate } from "./cron";

const SECRET = "cron-test-value-not-real-0123456789";
const call = (authorization?: string) => new Request("https://portpass.test/api/cron/daily", { headers: authorization ? { authorization } : {} });

describe("cronGate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses every call with 503 while CRON_SECRET is unset, in every environment, logs the name only, and tells the founders", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const notice = vi.fn();
    for (const env of [{}, { CRON_SECRET: "   " }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: "production" }]) {
      expect(cronGate(call(`Bearer ${SECRET}`), env, notice)).toEqual({ ok: false, status: 503, error: "Not set up." });
    }
    expect(error).toHaveBeenCalledTimes(5);
    const logged = error.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("/api/cron/daily: CRON_SECRET is not set");
    expect(logged).not.toContain(SECRET);
    expect(notice).toHaveBeenCalledTimes(5);
    expect(notice).toHaveBeenCalledWith("/api/cron/daily");
    // A notice that throws never changes the answer.
    expect(cronGate(call(), {}, () => { throw new Error("no mail"); })).toEqual({ ok: false, status: 503, error: "Not set up." });
  });

  it("refuses a call without the secret, or with the wrong one, with 401, and tells nobody", () => {
    const env = { CRON_SECRET: SECRET, VERCEL_ENV: "production" };
    const notice = vi.fn();
    expect(cronGate(call(), env, notice)).toEqual({ ok: false, status: 401, error: "Not allowed." });
    expect(notice).not.toHaveBeenCalled();
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
