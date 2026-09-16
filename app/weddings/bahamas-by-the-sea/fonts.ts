import { Cormorant_Garamond, Manrope } from "next/font/google";

export const bwsSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-bws-serif",
});

export const bwsSans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bws-sans",
});
