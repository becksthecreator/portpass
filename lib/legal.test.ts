import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legalDate, legalHeading, PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from "./legal";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("legal versions", () => {
  it("formats the date the way the pages show it", () => {
    expect(legalDate("2026-10-01")).toBe("1 October 2026");
    expect(legalDate("2026-09-01", true)).toBe("September 2026");
    expect(legalHeading({ version: 2, updated: "2026-10-01", changelog: [] })).toBe("Version 2 · last updated 1 October 2026");
  });

  it.each<[string, LegalDocument]>([["privacy", PRIVACY_POLICY], ["terms", TERMS_OF_SERVICE]])("%s: the changelog starts with the current version and runs newest first", (_name, doc) => {
    expect(doc.changelog[0].version).toBe(doc.version);
    expect(doc.changelog[0].date).toBe(doc.updated);
    const versions = doc.changelog.map((entry) => entry.version);
    expect(versions).toEqual([...versions].sort((a, b) => b - a));
    expect(new Set(versions).size).toBe(versions.length);
    for (const entry of doc.changelog) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.changes.length).toBeGreaterThan(0);
    }
  });
});

// Brief 16 D acceptance, kept as a test so a later edit can't quietly drop
// a required part: v2 with a date, the attorney-review note, the Google
// sign-in paragraph, the three retention periods, and the changelog.
describe("/privacy and /terms say what brief 16 requires", () => {
  const privacy = read("app/privacy/page.tsx");
  const terms = read("app/terms/page.tsx");

  it("both pages show the version line, the attorney-review note and the changelog", () => {
    for (const page of [privacy, terms]) {
      expect(page).toContain("<LegalVersionLine");
      expect(page).toContain("<AttorneyReviewNote />");
      expect(page).toContain("<LegalChangelog");
    }
    expect(PRIVACY_POLICY.version).toBe(2);
    expect(TERMS_OF_SERVICE.version).toBe(2);
  });

  it("the privacy policy names the Act and has the Google sign-in paragraph", () => {
    expect(privacy).toContain("Data Protection (Privacy of Personal Information) Act");
    expect(privacy).toContain("Data Protection Act, 2025");
    expect(privacy).toContain("your name, your email address and your profile photo");
    expect(privacy).toContain("PortPass never posts anything to Google");
  });

  it("the privacy policy states the retention periods Antonio approved", () => {
    expect(privacy).toMatch(/health details[\s\S]{0,200}90 days after the programme ends/);
    expect(privacy).toMatch(/Payment records:<\/strong> 7 years/);
    expect(privacy).toMatch(/Enquiries that don’t become a booking[\s\S]{0,200}2 years/);
  });

  it("neither page says anything the product doesn't do, or anything about VAT", () => {
    for (const page of [privacy, terms]) {
      expect(page).not.toMatch(/\bVAT\b/);
      expect(page).not.toMatch(/payment processor/i);
      expect(page).not.toMatch(/Effective September 2026/);
    }
  });
});
