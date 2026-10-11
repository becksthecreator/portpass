import { describe, expect, it } from "vitest";
import { AA, contrast, inkOn, NAVY, WHITE } from "./businessTheme";
import { EMAIL_PALETTE, failingPairs, FLAMINGO_NIGHT, pairContrast, TEXT_PAIRS, themeTokens, tokenStyle } from "./futprepTheme";

// Flamingo Night (brief 27, D): every pair that carries text reads to AA.
describe("Flamingo Night tokens", () => {
  it("every text-on-colour pair passes WCAG AA", () => {
    for (const pair of TEXT_PAIRS) expect(pairContrast(pair), pair.where).toBeGreaterThanOrEqual(AA);
    expect(failingPairs()).toEqual([]);
  });

  it("white never goes on pink: navy is the only ink for a pink fill", () => {
    expect(contrast(WHITE, FLAMINGO_NIGHT["--fp-pink"])).toBeLessThan(AA);
    expect(inkOn(FLAMINGO_NIGHT["--fp-pink"])).toBe(NAVY);
    expect(contrast(FLAMINGO_NIGHT["--fp-navy"], FLAMINGO_NIGHT["--fp-pink"])).toBeGreaterThanOrEqual(5.4);
    expect(contrast(FLAMINGO_NIGHT["--fp-navy"], FLAMINGO_NIGHT["--fp-mint"])).toBeGreaterThanOrEqual(8.3);
    expect(contrast(FLAMINGO_NIGHT["--fp-navy"], FLAMINGO_NIGHT["--fp-base"])).toBeGreaterThanOrEqual(16);
  });

  it("the email palette reads too: navy on the pink button, base on the navy header, pink-deep links", () => {
    expect(contrast(EMAIL_PALETTE.buttonText, EMAIL_PALETTE.button)).toBeGreaterThanOrEqual(AA);
    expect(contrast(EMAIL_PALETTE.headerText, EMAIL_PALETTE.headerBg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(EMAIL_PALETTE.eyebrow, EMAIL_PALETTE.headerBg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(EMAIL_PALETTE.link, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(EMAIL_PALETTE.muted, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(EMAIL_PALETTE.buttonText).not.toBe(WHITE);
  });
});

describe("tokens from the business row", () => {
  it("reads theme.tokens, upper-cases the hex, and ignores anything else", () => {
    const tokens = themeTokens({ background: "#0B1630", tokens: { "--fp-pink": "#ff4a86", "--fp-navy": "#101010", "--fp-evil": "#000000", "--fp-mint": "not a colour", "--fp-base": 12 } });
    expect(tokens["--fp-pink"]).toBe("#FF4A86");
    expect(tokens["--fp-navy"]).toBe("#101010");
    expect(tokens["--fp-mint"]).toBe(FLAMINGO_NIGHT["--fp-mint"]);
    expect(tokens["--fp-base"]).toBe(FLAMINGO_NIGHT["--fp-base"]);
    expect(Object.keys(tokens)).toEqual(Object.keys(FLAMINGO_NIGHT));
    expect("--fp-evil" in tokens).toBe(false);
  });

  it("falls back to Flamingo Night when the row has no tokens", () => {
    expect(themeTokens({})).toEqual(FLAMINGO_NIGHT);
    expect(themeTokens(null)).toEqual(FLAMINGO_NIGHT);
    expect(themeTokens("nope")).toEqual(FLAMINGO_NIGHT);
    expect(tokenStyle()["--fp-base"]).toBe("#F7F9FC");
  });

  it("a row can't make a dark section unreadable without the test saying so", () => {
    expect(failingPairs(themeTokens({ tokens: { "--fp-navy": "#FF4A86" } }))).toContain("buttons: navy words on the pink fill");
  });
});
