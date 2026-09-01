import type { Metadata } from "next";
import "./globals.css";
import "./staff.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://portpassbahamas.com"),
  title: "PortPass | Your club, better connected",
  description:
    "PortPass helps sports clubs and academies in The Bahamas organize, communicate, and grow.",
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
