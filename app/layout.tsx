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
          Vercel Web Analytics is NOT actually enabled for this project
          (confirmed 25 Sept: this script 404s on every single page load in
          production, per Part 5 of that day's brief) -- removed rather than
          left in place 404ing for every visitor. Re-add once Web Analytics
          is turned on for this project in the Vercel dashboard (Project ->
          Analytics -> Enable); at that point Vercel serves this exact path
          itself, so no npm dependency is needed (the @vercel/analytics
          package was tried and rejected earlier over an unrelated,
          pre-existing vite-version ERESOLVE conflict already latent in this
          repo's dependency tree).
        */}
      </body>
    </html>
  );
}
