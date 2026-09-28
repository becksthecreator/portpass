import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceCents } from "./format";

describe("public prices read as BSD (= USD)", () => {
  it("formats whole and fractional amounts with the currency note", () => {
    expect(formatPriceCents(12000)).toBe("$120 BSD (= USD)");
    expect(formatPriceCents(3550)).toBe("$35.50 BSD (= USD)");
    expect(formatPriceCents(120000)).toBe("$1,200 BSD (= USD)");
  });

  it("can drop the note where the context already says it", () => {
    expect(formatPriceCents(12000, { currency: false })).toBe("$120");
  });

  it("keeps the unit readable after the note", () => {
    expect(formatPrice(3500, "per_session")).toBe("$35 BSD (= USD) per session");
    expect(formatPrice(4000, "per_hour")).toBe("$40 BSD (= USD) per hour");
    expect(formatPrice(120000, "from")).toBe("From $1,200 BSD (= USD)");
    expect(formatPrice(9900, null)).toBe("$99 BSD (= USD)");
  });
});
