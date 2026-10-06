import { describe, expect, it } from "vitest";
import { ALERTS, alertPeriodKey, deviceHash, deviceLabel, isBusinessSettingsPath, networkOf, securityAlertEmail } from "./alerts";

describe("the security alerts", () => {
  it("are the four Brief 21 names, each with its rule in plain words", () => {
    expect(ALERTS.map((a) => a.kind)).toEqual(["failed_logins", "admin_new_device", "cron_unset", "site_errors_spike"]);
    expect(ALERTS.find((a) => a.kind === "failed_logins")).toMatchObject({ windowMinutes: 10, threshold: 10 });
    expect(ALERTS.find((a) => a.kind === "site_errors_spike")).toMatchObject({ windowMinutes: 10, threshold: 20 });
    for (const a of ALERTS) expect(a.rule.length).toBeGreaterThan(20);
  });

  it("fire at most once an hour per kind", () => {
    expect(alertPeriodKey("failed_logins", new Date("2026-10-06T14:05:00Z"))).toBe("failed_logins:2026-10-06T14");
    expect(alertPeriodKey("failed_logins", new Date("2026-10-06T14:59:59Z"))).toBe("failed_logins:2026-10-06T14");
    expect(alertPeriodKey("failed_logins", new Date("2026-10-06T15:00:00Z"))).not.toBe(alertPeriodKey("failed_logins", new Date("2026-10-06T14:59:59Z")));
  });

  it("recognise a device by browser and network, not by the exact address", async () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(networkOf("203.0.113.42")).toBe("203.0.113");
    expect(networkOf("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3:8d3");
    expect(networkOf("")).toBe("");
    expect(await deviceHash(ua, "203.0.113.42")).toBe(await deviceHash(ua, "203.0.113.99"));
    expect(await deviceHash(ua, "203.0.113.42")).not.toBe(await deviceHash(ua, "198.51.100.42"));
    expect(await deviceHash(ua, "203.0.113.42")).not.toBe(await deviceHash("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36", "203.0.113.42"));
    expect(await deviceHash(ua, "203.0.113.42")).toMatch(/^[0-9a-f]{32}$/);
    expect(deviceLabel(ua)).toBe("Safari on iPhone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/131.0")).toBe("Firefox on Mac");
    expect(deviceLabel("")).toBe("A browser on an unknown system");
  });

  it("know which business API writes are settings changes", () => {
    expect(isBusinessSettingsPath("PATCH", "/api/business/orgs/12")).toBe(true);
    expect(isBusinessSettingsPath("GET", "/api/business/orgs/12")).toBe(false);
    expect(isBusinessSettingsPath("PUT", "/api/business/orgs/12/payment-methods")).toBe(true);
    expect(isBusinessSettingsPath("POST", "/api/payments/orgs/12/settings")).toBe(true);
    expect(isBusinessSettingsPath("POST", "/api/payments/orgs/12/team")).toBe(true);
    expect(isBusinessSettingsPath("POST", "/api/business/orgs/12/invites")).toBe(true);
    expect(isBusinessSettingsPath("POST", "/api/business/orgs/12/perks")).toBe(true);
    expect(isBusinessSettingsPath("POST", "/api/business/orgs/12/perks/check")).toBe(false);
    expect(isBusinessSettingsPath("POST", "/api/business/orgs/12/perks/redeem")).toBe(false);
    expect(isBusinessSettingsPath("POST", "/api/business/orgs/12/attendance")).toBe(false);
    expect(isBusinessSettingsPath("PATCH", "/api/business/orgs/12/registrations/44")).toBe(false);
    expect(isBusinessSettingsPath("PATCH", "/api/business/orgs/12/bookings/9")).toBe(false);
    expect(isBusinessSettingsPath("POST", "/api/payments/orgs/12/requests")).toBe(false);
    expect(isBusinessSettingsPath("POST", "/api/admin/businesses")).toBe(false);
  });

  it("write an email with counts, kinds, addresses and times, and never a code, a PIN or an email address", () => {
    const at = new Date("2026-10-06T14:05:00Z");
    const failed = securityAlertEmail("failed_logins", { count: 12, windowMinutes: 10, kinds: { login_failed: 9, pin_failed: 3 }, at });
    expect(failed.subject).toBe("PortPass security: 12 failed sign-ins in 10 minutes");
    expect(failed.text).toContain("9 wrong sign-in codes, 3 wrong staff PINs");
    expect(failed.text).toContain("Admin → Security");
    const device = securityAlertEmail("admin_new_device", { label: "Safari on iPhone", ip: "203.0.113.42", userShort: "7f3a9c2e", at });
    expect(device.text).toContain("Safari on iPhone");
    expect(device.text).toContain("203.0.113.42");
    expect(device.text).toContain("sign that account out everywhere");
    const cron = securityAlertEmail("cron_unset", { path: "/api/cron/daily", at });
    expect(cron.text).toContain("/api/cron/daily");
    expect(cron.text).toContain("CRON_SECRET");
    const spike = securityAlertEmail("site_errors_spike", { count: 31, windowMinutes: 10, at });
    expect(spike.subject).toBe("PortPass security: 31 site errors in 10 minutes");
    for (const email of [failed, device, cron, spike]) {
      expect(email.html).toContain("<p>");
      expect(email.html).not.toMatch(/@/);
      expect(email.text).not.toMatch(/\b\d{6}\b/);
    }
  });
});
