import localFont from "next/font/local";

// Matches the main PortPass homepage's type (app/fonts.ts) at Antonio's
// request, so the wedding site reads as part of the same family of sites.
// Served from this project's own packages, not Google (see app/fonts.ts).
export const bwsSerif = localFont({
  src: [
    { path: "../../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-bws-serif",
});

export const bwsSans = localFont({
  src: [{ path: "../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-bws-sans",
});
