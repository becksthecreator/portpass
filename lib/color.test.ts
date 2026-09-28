import { describe, expect, it } from "vitest";
import { suggestForWhiteText, whiteTextContrast } from "./color";

describe("white-text contrast", () => {
  it("knows coral is too light for white text and coral-deep is fine", () => {
    expect(whiteTextContrast("#E8794A")!).toBeLessThan(4.5);
    expect(whiteTextContrast("#B9532A")!).toBeGreaterThanOrEqual(4.5);
  });

  it("suggests a darker shade that passes, and leaves passing colours alone", () => {
    const suggested = suggestForWhiteText("#E8794A")!;
    expect(whiteTextContrast(suggested)!).toBeGreaterThanOrEqual(4.5);
    expect(suggestForWhiteText("#14303d")).toBe("#14303d");
  });

  it("returns null for junk", () => {
    expect(whiteTextContrast("blue")).toBeNull();
    expect(suggestForWhiteText("#fff")).toBeNull();
  });
});
