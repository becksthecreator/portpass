import { describe, expect, it } from "vitest";
import { FUTPREP_PUBLIC_PATHS } from "./futprepOffSite";
import { futprepAppRoute, isFutprepAppHost } from "./futprepAppHost";

describe("register.futprep.com (19 Nov 2026)", () => {
  it("knows its host, with or without a port, and only that host", () => {
    expect(isFutprepAppHost("register.futprep.com")).toBe(true);
    expect(isFutprepAppHost("REGISTER.futprep.com:443")).toBe(true);
    expect(isFutprepAppHost("portpassbahamas.com")).toBe(false);
    expect(isFutprepAppHost("www.futprep.com")).toBe(false);
    expect(isFutprepAppHost(null)).toBe(false);
  });

  it("opens registration at the front door, keeping the link's tags", () => {
    expect(futprepAppRoute("/", "?utm_source=futprep_site")).toEqual({ kind: "redirect", to: "/futprep/register?utm_source=futprep_site" });
  });

  it("serves registration, the taster, booking, camps, families' pages, sign-in and the APIs", () => {
    for (const path of ["/futprep/register", "/futprep/register/return/abc", "/futprep/trial", "/futprep/book", "/futprep/camps", "/futprep/my/FP-1", "/futprep/feed", "/login", "/signup", "/account", "/pay/x", "/api/futprep/registrations", "/api/auth/callback"]) {
      expect(futprepAppRoute(path)).toEqual({ kind: "pass" });
    }
  });

  it("sends staff and the owner dashboard back to PortPass (rule 9)", () => {
    expect(futprepAppRoute("/futprep/staff/login", "?returnTo=x")).toEqual({ kind: "redirect", to: "https://portpassbahamas.com/futprep/staff/login?returnTo=x" });
    expect(futprepAppRoute("/business/futprep")).toEqual({ kind: "redirect", to: "https://portpassbahamas.com/business/futprep" });
  });

  it("sends everything else to futprep.com, never to another business's pages", () => {
    for (const path of ["/sports-fitness/futprep-athletics", "/admin", "/weddings", "/sites/futprep", "/futprep", "/futprepx", "/registerx"]) {
      expect(futprepAppRoute(path)).toEqual({ kind: "redirect", to: "https://www.futprep.com/" });
    }
  });

  it("is the only place registration opens: portpassbahamas.com redirects it away", () => {
    expect(FUTPREP_PUBLIC_PATHS).toContain("/futprep/register");
    expect(FUTPREP_PUBLIC_PATHS).toContain("/futprep/register/:path*");
  });
});
