import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "PortPass | Find and book it in The Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard title="Everything worth booking in The Bahamas." subtitle="Sports sessions, weddings, venues and events — found and booked in one place." />,
    { ...size, fonts: await ogFonts() },
  );
}
