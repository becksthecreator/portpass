import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "PortPass | Find and book it in The Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard title="Bookings and payments for Bahamian businesses." subtitle="Classes, tours, tables, appointments and events from businesses across The Bahamas. Book in a few taps and pay the business directly, by cash or bank transfer." />,
    { ...size, fonts: await ogFonts() },
  );
}
