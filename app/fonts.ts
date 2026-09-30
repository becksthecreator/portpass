import { Archivo, Fraunces, Inter } from "next/font/google";

// PortPass's own type (Harbour Signal brand, 28 Sept): Archivo for
// headings, loaded as a variable font with its width axis so the CSS can
// set font-stretch 112% (page headings, weight 800) and 125% (the hero
// line, weight 900) to match the lettering in the Prow logo. Inter stays
// for body. The CSS variable names are unchanged, so every existing
// `var(--font-pp-display)` rule now resolves to Archivo on PortPass pages.
export const ppDisplay = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-pp-display",
  display: "swap",
});

// Business listing pages (the shared Organization/Offering template that
// BWS, Futprep and every future business render through) keep the serif
// they launched with: the rebrand is PortPass's chrome, not their pages.
// Same CSS variable, so the template's rules need no change -- whichever
// class the page's wrapper carries decides. BWS's planner loads its own
// pair in app/weddings/bahamas-weddings-by-the-sea/fonts.ts.
export const bizDisplay = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-pp-display",
  display: "swap",
});

// Body text is not preloaded: only the heading font is (speed brief, 29
// Sept, 1.6), so the first paint waits for one font file, not two.
export const ppSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pp-sans",
  display: "swap",
  preload: false,
});
