import { describe, expect, it } from "vitest";
import { placesLeft } from "./futprepPlaces";

describe("places left (register V4)", () => {
  it("gives only the slug, the term and the count, never below zero", () => {
    const out = placesLeft([
      { slug: "lil-kickers", termId: 42, spotsRemaining: 8, earlyAccessOnly: false, capacity: 20, registered: 12 } as never,
      { slug: "kickers", termId: 43, spotsRemaining: -2, earlyAccessOnly: false } as never,
    ]);
    expect(out).toEqual([
      { slug: "lil-kickers", termId: 42, placesLeft: 8, full: false },
      { slug: "kickers", termId: 43, placesLeft: 0, full: true },
    ]);
  });

  it("leaves out a class that opens only through a returning family's link", () => {
    expect(placesLeft([{ slug: "early", termId: 1, spotsRemaining: 5, earlyAccessOnly: true }])).toEqual([]);
  });
});
