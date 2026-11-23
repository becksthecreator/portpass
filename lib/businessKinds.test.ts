import { describe, expect, it } from "vitest";
import { BUSINESS_KINDS, kindForSection, OTHER_MAX, resolveBusinessKind } from "./businessKinds";
import { isSectionSlug } from "./sections";

describe("resolveBusinessKind", () => {
  it("a kind with a section keeps the section and its label", () => {
    expect(resolveBusinessKind("sports-fitness", "")).toEqual({ ok: true, section: "sports-fitness", activityType: "Sports, fitness or a gym" });
    expect(resolveBusinessKind("tours", "ignored")).toEqual({ ok: true, section: "tours", activityType: "Tours, boats or activities" });
  });

  it("a kind with no section of its own (a salon, a caterer) is kept in words", () => {
    expect(resolveBusinessKind("salon-beauty", "")).toEqual({ ok: true, section: null, activityType: "Salon, barber or beauty" });
    expect(resolveBusinessKind("food-drink", "")).toMatchObject({ ok: true, section: null });
  });

  it("'Something else' needs a few words, tidied and capped", () => {
    expect(resolveBusinessKind("other", "")).toMatchObject({ ok: false });
    expect(resolveBusinessKind("other", " x ")).toMatchObject({ ok: false });
    expect(resolveBusinessKind("other", "  Food   truck ")).toEqual({ ok: true, section: null, activityType: "Other: Food truck" });
    const long = resolveBusinessKind("other", "a".repeat(500));
    expect(long.ok && long.activityType.length).toBe("Other: ".length + OTHER_MAX);
  });

  it("refuses an unknown kind, and nothing at all", () => {
    expect(resolveBusinessKind("crypto", "")).toMatchObject({ ok: false, error: expect.stringMatching(/kind of business/i) });
    expect(resolveBusinessKind("", "")).toMatchObject({ ok: false });
  });

  it("an older page that sends only a known section still works", () => {
    expect(resolveBusinessKind("", "", "venues")).toEqual({ ok: true, section: "venues", activityType: "A venue" });
    expect(resolveBusinessKind("", "", "crypto")).toMatchObject({ ok: false });
    // A kind always wins over a section sent alongside it.
    expect(resolveBusinessKind("salon-beauty", "", "venues")).toMatchObject({ ok: true, section: null });
  });
});

describe("BUSINESS_KINDS", () => {
  it("every section a kind points at is a real section, and values are unique", () => {
    for (const kind of BUSINESS_KINDS) if (kind.section) expect(isSectionSlug(kind.section)).toBe(true);
    expect(new Set(BUSINESS_KINDS.map((k) => k.value)).size).toBe(BUSINESS_KINDS.length);
    expect(BUSINESS_KINDS.at(-1)?.value).toBe("other");
  });

  it("a ?section= link picks the matching kind", () => {
    expect(kindForSection("venues")).toBe("venue");
    expect(kindForSection("sports-fitness")).toBe("sports-fitness");
    expect(kindForSection("nope")).toBe("");
    expect(kindForSection(null)).toBe("");
  });
});
