import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "Get listed on PortPass | PortPass Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard eyebrow="For business" title="Your bookings and payments in one place." subtitle="Send us your photos and prices on WhatsApp. We build your page, you share one link." />,
    { ...size, fonts: await ogFonts() },
  );
}
