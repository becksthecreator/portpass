import { Fraunces, Inter } from "next/font/google";

// Display face with real character for the homepage's headline moments —
// distinct from the wedding site's Cormorant Garamond so the two don't
// read as the same sub-brand.
export const ppDisplay = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-pp-display",
});

export const ppSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pp-sans",
});
