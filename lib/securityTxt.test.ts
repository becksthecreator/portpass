import { describe, expect, it } from "vitest";
import { securityTxt } from "./securityTxt";

describe("security.txt", () => {
  it("has the four fields the RFC wants, an expiry under a year away, and nothing else", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    const text = securityTxt(now);
    const lines = text.trimEnd().split("\n");
    expect(lines.map((l) => l.split(":")[0])).toEqual(["Contact", "Expires", "Preferred-Languages", "Canonical", "Policy"]);
    expect(lines[0]).toMatch(/^Contact: mailto:[^@\s]+@[^@\s]+$/);
    const expires = new Date(lines[1].slice("Expires: ".length));
    expect(expires.getTime() - now.getTime()).toBeLessThan(365 * 24 * 3600_000);
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
    expect(lines[3]).toBe("Canonical: https://portpassbahamas.com/.well-known/security.txt");
    expect(lines[4]).toMatch(/^Policy: https:\/\//);
    expect(text.endsWith("\n")).toBe(true);
  });
});
