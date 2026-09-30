import { describe, expect, it } from "vitest";
import { suggestForWhiteText, whiteTextContrast } from "./color";

describe("white-text contrast", () => {
  it("knows sky is too light for white text and harbour blue is fine", () => {
    expect(whiteTextContrast("#8DB8F2")!).toBeLessThan(4.5);
    expect(whiteTextContrast("#2463AE")!).toBeGreaterThanOrEqual(4.5);
  });

  it("suggests a darker shade that passes, and leaves passing colours alone", () => {
    const suggested = suggestForWhiteText("#8DB8F2")!;
    expect(whiteTextContrast(suggested)!).toBeGreaterThanOrEqual(4.5);
    expect(suggestForWhiteText("#0d1b3d")).toBe("#0d1b3d");
  });

  it("returns null for junk", () => {
    expect(whiteTextContrast("blue")).toBeNull();
    expect(suggestForWhiteText("#fff")).toBeNull();
  });
});
