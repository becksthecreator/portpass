import { describe, expect, it } from "vitest";
import { escapeLikePattern, normalizeReferenceCode } from "./referenceCode";

describe("normalizeReferenceCode", () => {
  it("accepts a real code in any case, with stray spaces", () => {
    expect(normalizeReferenceCode("FP-2026-AB12CD34")).toBe("FP-2026-AB12CD34");
    expect(normalizeReferenceCode("  fp-2026-ab12cd34 ")).toBe("FP-2026-AB12CD34");
    expect(normalizeReferenceCode("PS-2026-9F3K2A")).toBe("PS-2026-9F3K2A");
  });

  it("rejects anything that could act as a pattern or isn't a code", () => {
    for (const value of ["%", "FP-2026-%", "FP-____-________", "FP-2026-*", "FP-2026-AB12CD3%", "", "FP-2026", "FP-2026-AB12CD34-EXTRA", "FP 2026 AB12CD34", null, undefined, 42]) {
      expect(normalizeReferenceCode(value)).toBeNull();
    }
  });
});

describe("escapeLikePattern", () => {
  it("leaves an ordinary name alone and makes pattern characters literal", () => {
    expect(escapeLikePattern("Ava Rolle")).toBe("Ava Rolle");
    expect(escapeLikePattern("O'Brien-Smith")).toBe("O'Brien-Smith");
    expect(escapeLikePattern("%")).toBe("\%");
    expect(escapeLikePattern("A_a*")).toBe("A\_a\*");
    expect(escapeLikePattern("back\slash")).toBe("back\\slash");
  });
});
