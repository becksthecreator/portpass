import { Inter, Sora } from "next/font/google";

// PortPass's own type (Aragonite brand, 28 Sept): Sora for headings, Inter
// for body. The CSS variable names are unchanged so every existing
// `var(--font-pp-display)` rule now resolves to Sora. Bahamas Weddings By
// The Sea keeps its own pairing inside its page
// (app/weddings/bahamas-weddings-by-the-sea/fonts.ts).
export const ppDisplay = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-pp-display",
  display: "swap",
});

export const ppSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pp-sans",
  display: "swap",
});
