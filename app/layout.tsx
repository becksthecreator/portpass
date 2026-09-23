import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./staff.css";

const TITLE = "PortPass Bahamas | Find and Book Sports, Weddings, Venues & Events in Nassau";
const DESCRIPTION = "Sports sessions, weddings, venues and events — found, booked and paid for in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://portpassbahamas.com"),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "PortPass Bahamas",
    title: TITLE,
    description: DESCRIPTION,
    url: "https://portpassbahamas.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Bahamas Weddings By The Sea's arrival-plate no-flash guard. next/script's
// beforeInteractive strategy only works reliably when placed in the root
// layout (Next.js hoists it into <head> and runs it once per full page
// load, before hydration) -- it cannot be scoped to a single nested route,
// so this checks the path itself instead.
//
// It must only hold on the two BWS *home* routes -- the only places
// BwsArrival/BusinessArrivalPlate actually mount to clear it. It used to
// run (and hold) on every route unconditionally, on the theory that the
// [data-bws-arriving] CSS only ever matches .bws-theme/.site-shell-business
// so it'd be a no-op elsewhere -- but a sub-route like
// /weddings/bahamas-by-the-sea/plan is still inside .bws-theme, has no
// arrival component to clear the hold, and so stayed permanently
// opacity:0. A fresh visitor landing there from a package CTA saw a blank
// page forever. See also the failsafe rule in globals.css, which now
// forces the page visible after 2.2s regardless of this script or the
// arrival component running at all.
const BWS_ARRIVAL_GUARD = `
(function () {
  try {
    var path = location.pathname.replace(/\\/+$/, '') || '/';
    var isBwsHome = path === '/weddings/bahamas-by-the-sea' || path === '/sites/bahamas-weddings';
    if (!isBwsHome) return;
    var seen = sessionStorage.getItem('bws_arrival_seen') === '1';
    var reduced = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!seen && !reduced) {
      document.documentElement.setAttribute('data-bws-arriving', 'holding');
    }
  } catch (e) {
    // Unknown failure mode -- do NOT hold here. Holding requires an
    // arrival component to clear it, and if the guard itself is failing in
    // some unanticipated way, assuming we're on a route with no such
    // component is the safer default (a missed arrival animation, not a
    // blank page).
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script id="bws-arrival-guard" strategy="beforeInteractive">{BWS_ARRIVAL_GUARD}</Script>
        {children}
        {/*
          Vercel Web Analytics via the platform-served script directly,
          rather than the @vercel/analytics package -- adding that package
          triggered an ERESOLVE failure from an unrelated, pre-existing
          vite-version conflict already latent in this repo's dependency
          tree (vitest wants vite 5-7, something else in the tree resolves
          vite 8). This script is served by Vercel's edge network itself
          when Web Analytics is enabled for the project, so it needs no
          npm dependency at all.
        */}
        <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
