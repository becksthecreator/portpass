import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./staff.css";

const TITLE = "PortPass | Find and book it in The Bahamas";
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
// load, before hydration) -- it cannot be scoped to a single nested route.
// It's harmless everywhere else: the [data-bws-arriving] CSS it enables
// only ever matches .bws-theme, which exists only on the wedding site.
const BWS_ARRIVAL_GUARD = `
(function () {
  try {
    var seen = sessionStorage.getItem('bws_arrival_seen') === '1';
    var reduced = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!seen && !reduced) {
      document.documentElement.setAttribute('data-bws-arriving', 'holding');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-bws-arriving', 'holding');
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
        <Analytics />
      </body>
    </html>
  );
}
