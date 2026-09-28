import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./staff.css";
import { PwaRegister } from "./_components/PwaRegister";
import { ppDisplay, ppSans } from "./fonts";

const TITLE = "PortPass Bahamas | Find and Book Sports, Weddings, Venues & Events in Nassau";
const DESCRIPTION = "Sports sessions, weddings, venues and events — found and booked in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://portpassbahamas.com"),
  title: TITLE,
  description: DESCRIPTION,
  // Listing `apple` here is required: once `icons` is set in config, Next
  // stops emitting the link for app/apple-icon.tsx on its own (verified
  // live 27 Sept -- the PNG served, the <link> never appeared).
  icons: { icon: "/favicon.svg", apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }] },
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

// The installed app's title bar takes this colour (round 5, §6).
export const viewport: Viewport = { themeColor: "#0B2A3C" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Poppins + Inter on <body>, so every page -- sign-in, account, admin,
          staff, the offline page, the install banner -- has the brand type
          without setting it itself. Business listing pages put their own
          serif (bizDisplay) on their wrapper, which wins inside it. */}
      <body className={`${ppDisplay.variable} ${ppSans.variable}`}>
        {children}
        <PwaRegister />
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
      </body>
    </html>
  );
}
