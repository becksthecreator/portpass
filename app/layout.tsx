import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./staff.css";
import "@/lib/motion/tokens.css";
import "@/lib/motion/motion.css";
import { getSiteContent } from "@/db/siteContent";
import { GrowthBeacon } from "./_components/GrowthBeacon";
import { PwaRegister } from "./_components/PwaRegister";
import { analyticsRedactionScript } from "@/lib/analyticsRedact";
import { ppDisplay, ppSans } from "./fonts";

const TITLE = "PortPass Bahamas | Find and Book Sports, Weddings, Venues & Events in Nassau";
const DESCRIPTION = "Sports sessions, weddings, venues and events — found and booked in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://portpassbahamas.com"),
  title: TITLE,
  description: DESCRIPTION,
  // The Prow icons from PortPass-Logo-Files.zip (Harbour Signal): the SVG
  // favicon switches for dark mode, the .ico covers old tabs, and the
  // 180px PNG is the iPhone home-screen tile.
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48 32x32 16x16", type: "image/x-icon" }],
    apple: [{ url: "/brand/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
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
  // Search Console and Bing Webmaster (brief 11, 5 and 8). Verifying by the
  // DNS record is preferred; these tags are there if the meta-tag method
  // is used instead. Not secrets: they are printed in every page.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

// The installed app's title bar takes this colour (round 5, §6).
export const viewport: Viewport = { themeColor: "#0D1B3D" };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The motion kill switch (brief 22, M1): data-motion="on|off" from the
  // motion setting in Admin -> Content, read through the same cache as
  // the announcement bar (a failed read means "on"). lib/motion/motion.css
  // turns every animation and transition off under "off", and a visitor
  // who asked for reduced motion gets off whatever this says.
  const { motion } = await getSiteContent();
  return (
    <html lang="en" data-motion={motion ? "on" : "off"} suppressHydrationWarning>
      {/* Poppins + Inter on <body>, so every page -- sign-in, account, admin,
          staff, the offline page, the install banner -- has the brand type
          without setting it itself. Business listing pages put their own
          serif (bizDisplay) on their wrapper, which wins inside it. */}
      <body className={`${ppDisplay.variable} ${ppSans.variable}`}>
        {/* One line, before anything below it is parsed: "JavaScript is
            running". A scroll reveal starts hidden only when this is set,
            so a page without script shows everything at once. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.setAttribute('data-motion-js','')" }} />
        {children}
        <PwaRegister />
        <GrowthBeacon />
        {/*
          Vercel Web Analytics (cookieless, matches the privacy policy).
          Vercel serves /_vercel/insights/script.js itself once Web Analytics
          is enabled for the project (Project -> Analytics -> Enable); until
          then that path 404s for every visitor (confirmed 25 Sept), so the
          tag is behind VERCEL_WEB_ANALYTICS=1. The inline shim is Vercel's
          own queue: lib/analytics.ts calls window.va("event", ...) and
          anything fired before the script loads is kept, not lost. No npm
          dependency (the @vercel/analytics package hit a pre-existing
          vite-version ERESOLVE conflict in this repo's dependency tree).
        */}
        {process.env.VERCEL_WEB_ANALYTICS === "1" && (
          <>
            <script dangerouslySetInnerHTML={{ __html: "window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};" }} />
            <script defer src="/_vercel/insights/script.js" />
          </>
        )}
        {/*
          Vercel Speed Insights (speed brief, 29 Sept, 1.7): real-visitor
          Core Web Vitals. Same arrangement as analytics -- Vercel serves
          the script once Speed Insights is enabled for the project
          (Project -> Speed Insights -> Enable), so it sits behind
          VERCEL_SPEED_INSIGHTS=1 until Antonio flips that switch.
        */}
        {process.env.VERCEL_SPEED_INSIGHTS === "1" && (
          <>
            <script dangerouslySetInnerHTML={{ __html: "window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments)};" }} />
            <script defer src="/_vercel/speed-insights/script.js" />
          </>
        )}
        {/*
          Before either script sends anything, the page address is cleaned:
          staff, admin and account pages are not reported, reference codes
          and link tokens in the path are replaced, and every query
          parameter except the campaign tags is dropped (lib/analyticsRedact.ts;
          privacy policy v2). Both scripts replay this from their queue.
        */}
        {(process.env.VERCEL_WEB_ANALYTICS === "1" || process.env.VERCEL_SPEED_INSIGHTS === "1") && (
          <script dangerouslySetInnerHTML={{ __html: analyticsRedactionScript() }} />
        )}
      </body>
    </html>
  );
}
