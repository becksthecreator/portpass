import { AA, contrast } from "@/lib/businessTheme";

// Flamingo Night (brief 27, D): Futprep's palette as tokens. The values
// live in organizations.theme.tokens for the Futprep row and are emitted
// as CSS custom properties on each Futprep page's root; these constants
// are the same values, used as the fallback when the row has none and by
// the emails, which can't read CSS. PortPass's own pages never see them.
export const FLAMINGO_NIGHT = {
  // Action fills. Navy text on it (5.4:1); never white.
  "--fp-pink": "#FF4A86",
  // Pink as text on a light background (5.0:1).
  "--fp-pink-deep": "#D1185C",
  "--fp-pink-soft": "#FFE8F0",
  // Accent fills, navy text on it (8.3:1).
  "--fp-mint": "#2FC9AE",
  // Mint as text on a light background (5.0:1).
  "--fp-mint-deep": "#0F7A68",
  "--fp-mint-soft": "#E6FAF6",
  // Ink, header, footer and dark sections (16.4:1 on the base).
  "--fp-navy": "#0F1B2D",
  // Page background.
  "--fp-base": "#F7F9FC",
} as const;

export type FutprepToken = keyof typeof FLAMINGO_NIGHT;
export type FutprepTokens = Record<FutprepToken, string>;

const TOKEN_NAMES = Object.keys(FLAMINGO_NIGHT) as FutprepToken[];
const HEX = /^#[0-9a-f]{6}$/i;

// The tokens a business row carries: theme.tokens, keys as the CSS names,
// values as six-digit hex. Anything else in the object is ignored; a
// missing or broken token falls back to the Flamingo Night value, so a
// half-edited row can never leave a page without a colour.
export function themeTokens(theme: unknown): FutprepTokens {
  const given = theme && typeof theme === "object" && "tokens" in theme && (theme as { tokens?: unknown }).tokens && typeof (theme as { tokens: unknown }).tokens === "object"
    ? ((theme as { tokens: Record<string, unknown> }).tokens)
    : {};
  const out = { ...FLAMINGO_NIGHT } as FutprepTokens;
  for (const name of TOKEN_NAMES) {
    const value = given[name];
    if (typeof value === "string" && HEX.test(value.trim())) out[name] = value.trim().toUpperCase();
  }
  return out;
}

// For a page root's style attribute: {"--fp-pink": "#FF4A86", ...}.
export function tokenStyle(tokens: FutprepTokens = FLAMINGO_NIGHT): Record<string, string> {
  return { ...tokens };
}

// Every pair that carries text, checked to WCAG AA in lib/futprepTheme.test.ts.
export const TEXT_PAIRS: { text: FutprepToken; on: FutprepToken; where: string }[] = [
  { text: "--fp-navy", on: "--fp-pink", where: "buttons: navy words on the pink fill" },
  { text: "--fp-navy", on: "--fp-mint", where: "accent fills: navy words on mint" },
  { text: "--fp-navy", on: "--fp-base", where: "body text on the page" },
  { text: "--fp-navy", on: "--fp-pink-soft", where: "text on a soft pink panel" },
  { text: "--fp-navy", on: "--fp-mint-soft", where: "text on a soft mint panel" },
  { text: "--fp-pink-deep", on: "--fp-base", where: "pink as text on the page" },
  { text: "--fp-mint-deep", on: "--fp-base", where: "mint as text on the page" },
  { text: "--fp-base", on: "--fp-navy", where: "body text on a dark section" },
  { text: "--fp-mint", on: "--fp-navy", where: "links and eyebrows on a dark section" },
  { text: "--fp-pink", on: "--fp-navy", where: "a pink word in a dark headline" },
];

export function pairContrast(pair: { text: FutprepToken; on: FutprepToken }, tokens: FutprepTokens = FLAMINGO_NIGHT): number {
  return contrast(tokens[pair.text], tokens[pair.on]);
}

export function failingPairs(tokens: FutprepTokens = FLAMINGO_NIGHT): string[] {
  return TEXT_PAIRS.filter((pair) => pairContrast(pair, tokens) < AA).map((pair) => pair.where);
}

// The same palette for Futprep's emails (lib/futprepEmail.ts), which get
// colours inline rather than from CSS custom properties.
export const EMAIL_PALETTE = {
  headerBg: FLAMINGO_NIGHT["--fp-navy"],
  headerText: FLAMINGO_NIGHT["--fp-base"],
  eyebrow: FLAMINGO_NIGHT["--fp-mint"],
  button: FLAMINGO_NIGHT["--fp-pink"],
  buttonText: FLAMINGO_NIGHT["--fp-navy"],
  link: FLAMINGO_NIGHT["--fp-pink-deep"],
  text: FLAMINGO_NIGHT["--fp-navy"],
  muted: "#5B6472",
} as const;
