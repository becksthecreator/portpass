import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, CSP_MODE, CSP_REPORT_PATH, securityHeaders } from "./securityHeaders";

const byName = (mode?: "report-only" | "enforce") => new Map(securityHeaders(mode).map((h) => [h.key.toLowerCase(), h.value]));

describe("the security headers", () => {
  it("are the six Brief 21 asks for, with the values it asks for", () => {
    const headers = byName();
    expect(headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(headers.size).toBe(6);
  });

  it("sends the policy as report-only until the switch is flipped, then enforces the same policy", () => {
    expect(CSP_MODE).toBe("report-only");
    expect(byName("report-only").get("content-security-policy-report-only")).toBe(contentSecurityPolicy());
    expect(byName("report-only").has("content-security-policy")).toBe(false);
    expect(byName("enforce").get("content-security-policy")).toBe(contentSecurityPolicy());
    expect(byName("enforce").has("content-security-policy-report-only")).toBe(false);
  });

  it("frames nobody, runs nothing from an unknown origin, and reports to our own route", () => {
    const csp = contentSecurityPolicy();
    const directive = (name: string) => csp.split("; ").find((d) => d === name || d.startsWith(`${name} `)) ?? "";
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("script-src").split(" ")).not.toContain("https:");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(directive("connect-src").split(" ")).not.toContain("https:");
    expect(directive("upgrade-insecure-requests")).toBe("upgrade-insecure-requests");
    expect(directive("report-uri")).toBe(`report-uri ${CSP_REPORT_PATH}`);
    // Every directive is well formed: a name and its sources, no stray punctuation.
    for (const part of csp.split("; ")) expect(part).toMatch(/^[a-z-]+( [^;]+)?$/);
  });

  it("is what next.config.ts sends on every path, and what the live-site check looks for", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('from "./lib/securityHeaders"');
    expect(config).toMatch(/source:\s*"\/\(\.\*\)"/);
    expect(config).toMatch(/headers:\s*securityHeaders\(\)/);
    const script = readFileSync(join(process.cwd(), "scripts/security/headers-check.mjs"), "utf8");
    for (const { key } of securityHeaders("enforce")) {
      const name = key.toLowerCase();
      expect(script, `${name} is not checked by scripts/security/headers-check.mjs`).toContain(name === "content-security-policy" ? '"content-security-policy"' : `"${name}"`);
    }
    expect(script).toContain('"content-security-policy-report-only"');
  });
});
