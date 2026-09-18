import type { Metadata } from "next";
import "./globals.css";
import "./staff.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://portpassbahamas.com"),
  title: "PortPass | Find and book it in The Bahamas",
  description:
    "PortPass is where you find and book things in The Bahamas — sports programs, weddings, and more.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
