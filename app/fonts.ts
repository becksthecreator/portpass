import localFont from "next/font/local";

// The type is served from this project's own packages (@fontsource-variable,
// 19 Nov 2026), not fetched from Google at build time: next/font/google's
// download failed often enough in CI to turn many PRs' build red.
// The same faces, the same CSS variables and the same options as before.
// PortPass's own type (Harbour Signal brand, 28 Sept): Archivo for
// headings, a variable font with its width axis so the CSS can set
// font-stretch 112% (page headings, weight 800) and 125% (the hero line,
// weight 900) to match the lettering in the Prow logo. Inter stays for
// body. The CSS variable names are unchanged, so every existing
// `var(--font-pp-display)` rule now resolves to Archivo on PortPass pages.
export const ppDisplay = localFont({
  src: [{ path: "../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-pp-display",
  display: "swap",
});

// Business listing pages (the shared Organization/Offering template that
// BWS, Futprep and every future business render through) keep the serif
// they launched with: the rebrand is PortPass's chrome, not their pages.
// Same CSS variable, so the template's rules need no change -- whichever
// class the page's wrapper carries decides. BWS's planner loads its own
// pair in app/weddings/bahamas-weddings-by-the-sea/fonts.ts.
export const bizDisplay = localFont({
  src: [
    { path: "../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-pp-display",
  display: "swap",
});

// Body text is not preloaded: only the heading font is (speed brief, 29
// Sept, 1.6), so the first paint waits for one font file, not two.
export const ppSans = localFont({
  src: [{ path: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-pp-sans",
  display: "swap",
  preload: false,
});
