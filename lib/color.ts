// Small, dependency-free colour maths shared by the owner wizard (client)
// and anything server-side that wants the same numbers. WCAG relative
// luminance and contrast ratio, plus "darken until white text is readable".
export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];

// Contrast of white text on the given colour, or null for an invalid hex.
export function whiteTextContrast(hex: string): number | null {
  const rgb = hexToRgb(hex);
  return rgb ? contrastRatio(rgb, WHITE) : null;
}

// The nearest darker shade (same hue, scaled toward black) on which white
// text clears 4.5:1. Returns the input unchanged when it already does.
export function suggestForWhiteText(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let [r, g, b] = rgb;
  let guard = 0;
  while (contrastRatio([r, g, b], WHITE) < 4.5 && guard < 30) {
    r *= 0.9;
    g *= 0.9;
    b *= 0.9;
    guard += 1;
  }
  return rgbToHex([r, g, b]);
}
