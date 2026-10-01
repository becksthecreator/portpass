import { describe, expect, it } from "vitest";
import { analyticsRedactionScript, redactAnalyticsUrl } from "./analyticsRedact";

const SITE = "https://portpassbahamas.com";

describe("redactAnalyticsUrl", () => {
  it("leaves an ordinary public page alone", () => {
    expect(redactAnalyticsUrl(`${SITE}/sports-fitness/futprep-athletics`)).toBe(`${SITE}/sports-fitness/futprep-athletics`);
    expect(redactAnalyticsUrl(`${SITE}/business`)).toBe(`${SITE}/business`);
    expect(redactAnalyticsUrl(`${SITE}/`)).toBe(`${SITE}/`);
  });

  it("never reports staff, admin, account or business-dashboard pages", () => {
    for (const path of ["/admin", "/admin/people", "/organizations/1", "/account", "/where-to", "/business/setup", "/business/futprep/settings", "/futprep/staff", "/futprep/staff/admin/42", "/weddings/admin/7", "/weddings/staff/login"]) {
      expect(redactAnalyticsUrl(`${SITE}${path}`)).toBeNull();
    }
  });

  it("replaces a registration code or a return-link token in the path", () => {
    expect(redactAnalyticsUrl(`${SITE}/futprep/my/FP-2026-AB12CD34`)).toBe(`${SITE}/futprep/my/[code]`);
    expect(redactAnalyticsUrl(`${SITE}/futprep/my/FP-2026-AB12CD34/complete`)).toBe(`${SITE}/futprep/my/[code]/complete`);
    expect(redactAnalyticsUrl(`${SITE}/futprep/register/return/s3cr3t-t0ken`)).toBe(`${SITE}/futprep/register/return/[token]`);
    expect(redactAnalyticsUrl(`${SITE}/futprep/my`)).toBe(`${SITE}/futprep/my`);
  });

  it("drops every query parameter except the campaign tags", () => {
    expect(redactAnalyticsUrl(`${SITE}/signup?email=parent%40example.com&name=Jane+Doe&next=%2Faccount`)).toBe(`${SITE}/signup`);
    expect(redactAnalyticsUrl(`${SITE}/futprep/register?program=kickers&term=3&join=FP-2026-AB12CD34&utm_campaign=taster_join`)).toBe(`${SITE}/futprep/register?utm_campaign=taster_join`);
    expect(redactAnalyticsUrl(`${SITE}/apply?utm_source=own&utm_medium=qr&utm_campaign=own2026`)).toBe(`${SITE}/apply?utm_source=own&utm_medium=qr&utm_campaign=own2026`);
    expect(redactAnalyticsUrl(`${SITE}/?source=pwa`)).toBe(`${SITE}/?source=pwa`);
  });

  it("drops the event rather than send something it can't parse", () => {
    expect(redactAnalyticsUrl("http://[bad")).toBeNull();
  });
});

describe("the inline hook the layout ships", () => {
  function install() {
    const hooks: Record<string, (event: { type: string; url?: string }) => unknown> = {};
    const fakeWindow = {
      va: (name: string, fn: (event: { type: string; url?: string }) => unknown) => { hooks[`va:${name}`] = fn; },
      si: (name: string, fn: (event: { type: string; url?: string }) => unknown) => { hooks[`si:${name}`] = fn; },
    };
    // The script only touches `window`; run it against a stand-in.
    new Function("window", "URL", analyticsRedactionScript())(fakeWindow, URL);
    return hooks;
  }

  it("registers the same hook with both Vercel queues and is self-contained", () => {
    const hooks = install();
    expect(Object.keys(hooks).sort()).toEqual(["si:beforeSend", "va:beforeSend"]);
    const event = hooks["va:beforeSend"]({ type: "pageview", url: `${SITE}/futprep/my/FP-2026-AB12CD34?x=1` });
    expect(event).toEqual({ type: "pageview", url: `${SITE}/futprep/my/[code]` });
    expect(hooks["si:beforeSend"]({ type: "vital", url: `${SITE}/futprep/staff/coach?session=9` })).toBeNull();
    expect(hooks["va:beforeSend"]({ type: "event" })).toEqual({ type: "event" });
  });
});
