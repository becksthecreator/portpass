import { Fraunces, Inter } from "next/font/google";

// Display face with real character for the homepage's headline moments.
// The wedding site (app/weddings/bahamas-by-the-sea/fonts.ts) intentionally
// loads the same Fraunces/Inter pairing at Antonio's request.
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
