import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "PortPass | A new set of eyes for your business";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard title="A new set of eyes for your business." subtitle="We diagnose what's stuck in your Bahamian business, fix it with the PortPass app and run it with you. The first look is free." />,
    { ...size, fonts: await ogFonts() },
  );
}
