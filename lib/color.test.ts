import { describe, expect, it } from "vitest";
import { suggestForWhiteText, whiteTextContrast } from "./color";

describe("white-text contrast", () => {
  it("knows gold is too light for white text and deep teal is fine", () => {
    expect(whiteTextContrast("#FFC21A")!).toBeLessThan(4.5);
    expect(whiteTextContrast("#00737A")!).toBeGreaterThanOrEqual(4.5);
  });

  it("suggests a darker shade that passes, and leaves passing colours alone", () => {
    const suggested = suggestForWhiteText("#FFC21A")!;
    expect(whiteTextContrast(suggested)!).toBeGreaterThanOrEqual(4.5);
    expect(suggestForWhiteText("#0b2a3c")).toBe("#0b2a3c");
  });

  it("returns null for junk", () => {
    expect(whiteTextContrast("blue")).toBeNull();
    expect(suggestForWhiteText("#fff")).toBeNull();
  });
});
