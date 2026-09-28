import { Fraunces, Inter, Sora } from "next/font/google";

// PortPass's own type (Aragonite brand, 28 Sept): Sora for headings, Inter
// for body. The CSS variable names are unchanged so every existing
// `var(--font-pp-display)` rule now resolves to Sora on PortPass pages.
export const ppDisplay = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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

export const ppSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pp-sans",
  display: "swap",
});
