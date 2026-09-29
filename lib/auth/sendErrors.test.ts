import { describe, expect, it } from "vitest";
import { appLimitFailure, formatWait, supabaseSendFailure } from "./sendErrors";
import { createRateLimiterWithRetry } from "./rateLimit";

describe("sign-in code send failures (02 brief, A2)", () => {
  it("names Supabase's hourly mailer limit and waits an hour", () => {
    const f = supabaseSendFailure({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" }, "login");
    expect(f.status).toBe(429);
    expect(f.code).toBe("email_provider_limit");
    expect(f.error).toMatch(/hourly limit/);
    expect(f.retryAfter).toBe(3600);
  });

  it("tells a login with no account to sign up, but never on sign-up", () => {
    expect(supabaseSendFailure({ code: "otp_disabled", message: "Signups not allowed for otp" }, "login").code).toBe("no_account");
    expect(supabaseSendFailure({ code: "otp_disabled", message: "Signups not allowed for otp" }, "signup").code).toBe("send_failed");
  });

  it("keeps the app limits' wording and adds the wait", () => {
    expect(appLimitFailure("email", 95)).toMatchObject({ status: 429, retryAfter: 95, error: expect.stringMatching(/this email/) });
    expect(appLimitFailure("ip", 40)).toMatchObject({ status: 429, retryAfter: 40 });
  });

  it("formats the countdown", () => {
    expect(formatWait(45)).toBe("45s");
    expect(formatWait(760)).toBe("12:40");
    expect(formatWait(3600)).toBe("60:00");
  });
});

describe("createRateLimiterWithRetry", () => {
  it("reports the seconds until the window resets once over the limit", () => {
    const hit = createRateLimiterWithRetry(2, 10_000);
    expect(hit("a")).toEqual({ limited: false, retryAfter: 0 });
    expect(hit("a")).toEqual({ limited: false, retryAfter: 0 });
    const third = hit("a");
    expect(third.limited).toBe(true);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect(third.retryAfter).toBeLessThanOrEqual(10);
    expect(hit("b").limited).toBe(false);
  });
});
