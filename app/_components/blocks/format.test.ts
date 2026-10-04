import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceCents, PRICE_CURRENCY_LINE } from "./format";

describe("public prices", () => {
  it("are the amount alone, whole or with cents", () => {
    expect(formatPriceCents(12000)).toBe("$120");
    expect(formatPriceCents(3550)).toBe("$35.50");
    expect(formatPriceCents(120000)).toBe("$1,200");
    expect(formatPriceCents(12000, { currency: false })).toBe("$120");
  });

  it("carry their unit and never a currency note", () => {
    expect(formatPrice(3500, "per_session")).toBe("$35 per session");
    expect(formatPrice(4000, "per_hour")).toBe("$40 per hour");
    expect(formatPrice(120000, "from")).toBe("From $1,200");
    expect(formatPrice(9900, null)).toBe("$99");
    for (const unit of ["per_session", "per_term", "per_hour", "per_day", "per_person", "per_child", "from", null]) expect(formatPrice(3500, unit)).not.toMatch(/USD|BSD/);
  });

  it("say the currency once, in the footer line", () => {
    expect(PRICE_CURRENCY_LINE).toBe("Prices in Bahamian dollars (BSD), equal to US dollars.");
  });
});
