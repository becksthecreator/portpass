// A business supplies one brand colour, or gets the platform default
// (coral). Either way this is the only mechanism that ever varies the
// interface per business -- one CSS custom property pair, set inline on
// that page's own <main> and nowhere else, never on :root or <body> (so
// it can never reach the SiteHeader/SiteFooter chrome, which reads only
// the fixed base tokens).
//
// --brand-text is computed here rather than trusted from the database:
// a business handing over a bright, light colour must not be able to
// produce unreadable text just by picking a bad hex code. It's derived,
// not stored, so there's no separate value that can drift out of sync
// with the source colour.
const PAPER_HEX = "#fbfaf6";
const DEFAULT_BRAND = "#e8794a";
const MIN_CONTRAST = 4.5;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

// Darkens toward black in fixed steps until the colour reads at least
// MIN_CONTRAST against the platform's paper background. A colour that's
// already dark enough (most real brand colours are) comes back unchanged.
function ensureContrastAgainstPaper(rgb: [number, number, number]): [number, number, number] {
  const paper = hexToRgb(PAPER_HEX)!;
  let [r, g, b] = rgb;
  let guard = 0;
  while (contrastRatio([r, g, b], paper) < MIN_CONTRAST && guard < 20) {
    r *= 0.9; g *= 0.9; b *= 0.9;
    guard += 1;
  }
  return [r, g, b];
}

export function computeBrandTokens(brandColorHex: string | null): { brand: string; brandText: string } {
  const rgb = brandColorHex ? hexToRgb(brandColorHex) : null;
  if (!rgb) return { brand: DEFAULT_BRAND, brandText: DEFAULT_BRAND };
  const brand = rgbToHex(rgb);
  const brandText = rgbToHex(ensureContrastAgainstPaper(rgb));
  return { brand, brandText };
}
