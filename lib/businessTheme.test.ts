import { describe, expect, it } from "vitest";
import { AA, businessTheme, contrast, inkOn, NAVY, themeVars, WHITE } from "./businessTheme";

const FUTPREP = "#124055";
const BWS = "#14707F";
const CARV_LIME = "#E4FB3E";

describe("a business's colours", () => {
  it("leaves a dark brand colour exactly as it is, with white text on it", () => {
    for (const brand of [FUTPREP, BWS]) {
      const t = businessTheme(brand);
      expect(t.brand).toBe(brand);
      expect(t.brandText).toBe(brand);
      expect(t.fill).toBe(brand);
      expect(t.onFill).toBe(WHITE);
      expect(t.headerBg).toBe(brand);
      expect(t.headerInk).toBe(WHITE);
    }
  });

  it("gives Carv its lime on navy: navy text on lime, never white on lime", () => {
    const t = businessTheme(CARV_LIME, {});
    expect(t.fill).toBe(CARV_LIME);
    expect(t.onFill).toBe(NAVY);
    expect(contrast(t.onFill, t.fill)).toBeGreaterThanOrEqual(AA);
    expect(contrast(WHITE, CARV_LIME)).toBeLessThan(AA);
    // With no photo, the header is navy with the lime as its accent.
    expect(t.headerBg).toBe(NAVY);
    expect(t.headerInk).toBe(WHITE);
    expect(t.headerAccent).toBe(CARV_LIME);
    // As text on white paper the lime is darkened until it reads.
    expect(contrast(t.brandText, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(inkOn(CARV_LIME)).toBe(NAVY);
  });

  it("enforces AA on every pair that carries text, whatever colour a business picks", () => {
    const picks = ["#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF8800", "#808080", "#7A7A7A", "#C0C0C0", "#E91E63", "#00BCD4", "#9E9E9E", "#F5F5DC", "#3F51B5", "#8BC34A", "#FFC107", "#795548"];
    for (const brand of picks) {
      const t = businessTheme(brand);
      expect(contrast(t.onFill, t.fill), `button text on ${brand}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.headerInk, t.headerBg), `header text for ${brand}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.brandText, WHITE), `brand as text for ${brand}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.pageInk, t.pageBg), `page text for ${brand}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.pageMuted, t.pageBg), `quiet page text for ${brand}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.pageLink, t.pageBg), `page links for ${brand}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.pageInk, t.pageSurface), `text on a raised surface for ${brand}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("takes a background the business gave, and ignores anything that isn't a colour", () => {
    expect(businessTheme(CARV_LIME, { background: "#0b1630" }).headerBg).toBe("#0B1630");
    expect(businessTheme(CARV_LIME, { background: "url(javascript:alert(1))" }).headerBg).toBe(NAVY);
    expect(businessTheme("not a colour").brand).toBe("#2463AE");
    expect(businessTheme(null, "nonsense").brand).toBe("#2463AE");
    // A light background a business gives still gets readable text.
    const light = businessTheme(FUTPREP, { background: "#F4F1EA" });
    expect(light.headerInk).toBe(NAVY);
    expect(contrast(light.headerInk, light.headerBg)).toBeGreaterThanOrEqual(AA);
  });

  it("hands the page only colours, as CSS variables", () => {
    const vars = themeVars(businessTheme(CARV_LIME));
    expect(vars).toMatchObject({ "--brand": CARV_LIME, "--brand-fill": CARV_LIME, "--brand-on-fill": NAVY, "--hdr-bg": NAVY });
    for (const value of Object.values(vars)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });
});
