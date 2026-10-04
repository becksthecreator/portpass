// A business's colours, from its data (brief 18, D2 and G2): one brand
// colour (organizations.brand_color) and, optionally, a few overrides in
// organizations.theme. Everything a page needs is derived here, and every
// pair that carries text is checked: a business can't make its own page
// unreadable by picking a bright colour. Pure, shared by the page, the
// registration form, the emails and the tests.
import { contrastRatio, hexToRgb, rgbToHex } from "@/lib/color";

type Rgb = [number, number, number];

export const NAVY = "#0D1B3D";
export const WHITE = "#FFFFFF";
const DEFAULT_BRAND = "#2463AE";
// WCAG AA for normal text.
export const AA = 4.5;

const rgb = (hex: string): Rgb => hexToRgb(hex) ?? (hexToRgb(DEFAULT_BRAND) as Rgb);

export function contrast(a: string, b: string): number {
  return contrastRatio(rgb(a), rgb(b));
}

// Scales a colour toward black (darker) or white (lighter) until it reads
// at `min` against `against`; unchanged when it already does.
function shadeUntil(hex: string, against: string, direction: "darker" | "lighter", min = AA): string {
  let [r, g, b] = rgb(hex);
  const other = rgb(against);
  for (let guard = 0; guard < 40 && contrastRatio([r, g, b], other) < min; guard += 1) {
    if (direction === "darker") [r, g, b] = [r * 0.92, g * 0.92, b * 0.92];
    else [r, g, b] = [r + (255 - r) * 0.1, g + (255 - g) * 0.1, b + (255 - b) * 0.1];
  }
  return rgbToHex([r, g, b]).toUpperCase();
}

// The text colour for a filled shape: white where it reads, navy where it
// doesn't (a lime or yellow fill gets navy text, never white).
export function inkOn(fill: string): string {
  return contrast(WHITE, fill) >= AA ? WHITE : NAVY;
}

export type BusinessTheme = {
  // The business's colour as given, and the same colour darkened until it
  // reads as text on white paper.
  brand: string;
  brandText: string;
  // Buttons and badges: the fill and the text on it.
  fill: string;
  onFill: string;
  // The header a page shows while the business has no photo: its
  // background, the text on it and an accent line/logo ring.
  headerBg: string;
  headerInk: string;
  headerAccent: string;
  // A dark page (registration form, emails' header) built from the same
  // colours: background, raised surface, text, quieter text and links.
  pageBg: string;
  pageSurface: string;
  pageInk: string;
  pageMuted: string;
  pageLink: string;
};

function validHex(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
}

// `theme` is organizations.theme: {"background": "#0B1630"} overrides the
// header and page background. Anything else in it is ignored here.
export function businessTheme(brandColor: string | null, theme?: unknown): BusinessTheme {
  const brand = validHex(brandColor) ?? DEFAULT_BRAND;
  const overrides = (theme && typeof theme === "object" ? theme : {}) as Record<string, unknown>;
  const brandText = shadeUntil(brand, WHITE, "darker");

  // A fill carries text. White or navy on the brand colour itself where
  // one of them reads; otherwise the darkened brand with white.
  const brandFills = contrast(WHITE, brand) >= AA || contrast(NAVY, brand) >= AA;
  const fill = brandFills ? brand : brandText;
  const onFill = inkOn(fill);

  // A header with no photo: the business's own background if it gave one;
  // its brand colour when white reads on it; navy for a bright brand
  // colour, which then shows as the accent.
  // (A background on which neither white nor navy reads is not used.)
  const given = validHex(overrides.background);
  const givenReads = given !== null && (contrast(WHITE, given) >= AA || contrast(NAVY, given) >= AA);
  const headerBg = givenReads ? (given as string) : contrast(WHITE, brand) >= AA ? brand : NAVY;
  const headerInk = inkOn(headerBg);
  const headerAccent = contrast(brand, headerBg) >= 3 ? brand : headerInk;

  const dark = contrast(WHITE, headerBg) >= AA;
  const pageBg = dark ? headerBg : NAVY;
  const pageInk = WHITE;
  // A raised surface a shade off the background: lighter where white text
  // still reads on it, darker otherwise.
  const lighter = shadeUntil(pageBg, pageBg, "lighter", 1.18);
  const pageSurface = contrast(pageInk, lighter) >= AA ? lighter : shadeUntil(pageBg, pageBg, "darker", 1.18);
  return {
    brand,
    brandText,
    fill,
    onFill,
    headerBg,
    headerInk,
    headerAccent,
    pageBg,
    pageSurface,
    pageInk,
    // Quieter text and links on the dark page, each lightened until it reads.
    pageMuted: shadeUntil("#C9D2E3", pageBg, "lighter"),
    pageLink: shadeUntil(brand, pageBg, "lighter"),
  };
}

// The CSS custom properties a page sets inline on its own <main>, and
// nowhere else (never :root or <body>): PortPass's own header and footer
// read only the base tokens.
export function themeVars(t: BusinessTheme): Record<string, string> {
  return {
    "--brand": t.brand,
    "--brand-text": t.brandText,
    "--brand-fill": t.fill,
    "--brand-on-fill": t.onFill,
    "--hdr-bg": t.headerBg,
    "--hdr-ink": t.headerInk,
    "--hdr-accent": t.headerAccent,
  };
}
