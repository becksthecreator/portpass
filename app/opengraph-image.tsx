import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "PortPass | Find and book it in The Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard title="Bookings and payments for Bahamian businesses." subtitle="Book Bahamian businesses on PortPass and pay them directly, by cash or bank transfer. Starting with sports and fitness, opening to every business." />,
    { ...size, fonts: await ogFonts() },
  );
}
