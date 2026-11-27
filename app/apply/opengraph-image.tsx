import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "Your free First Look | PortPass Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard eyebrow="For Nassau businesses" title="Your free First Look." subtitle="We look at your business the way a new customer does. Then we show you what we found." />,
    { ...size, fonts: await ogFonts() },
  );
}
