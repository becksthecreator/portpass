import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

export const alt = "PortPass | Find and book it in The Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard title="Sports and fitness in The Bahamas." subtitle="Sports clubs, coaches and gyms in The Bahamas: find a class, register and pay the club directly." />,
    { ...size, fonts: await ogFonts() },
  );
}
