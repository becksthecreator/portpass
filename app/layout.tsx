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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
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
