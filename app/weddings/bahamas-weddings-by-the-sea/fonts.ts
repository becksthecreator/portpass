import { Fraunces, Inter } from "next/font/google";

// Matches the main PortPass homepage's type (app/fonts.ts) at Antonio's
// request, so the wedding site reads as part of the same family of sites.
export const bwsSerif = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-bws-serif",
});

export const bwsSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bws-sans",
});
