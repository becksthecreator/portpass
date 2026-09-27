import { describe, expect, it } from "vitest";
import { isReservedSlug, isValidSlug } from "./reservedSlugs";

describe("reserved slugs", () => {
  it("refuses names that are already routes", () => {
    for (const slug of ["admin", "api", "login", "account", "sports-fitness", "own", "sites", "where-to"]) {
      expect(isReservedSlug(slug, "top"), slug).toBe(true);
    }
    for (const slug of ["admin", "staff", "register", "plan", "settings"]) {
      expect(isReservedSlug(slug, "second"), slug).toBe(true);
    }
  });

  it("lets real business and category slugs through", () => {
    expect(isReservedSlug("carv-performance", "top")).toBe(false);
    expect(isReservedSlug("djs", "second")).toBe(false);
  });

  it("validates slug shape", () => {
    expect(isValidSlug("bahamas-weddings")).toBe(true);
    expect(isValidSlug("Bahamas Weddings")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
  });
});
