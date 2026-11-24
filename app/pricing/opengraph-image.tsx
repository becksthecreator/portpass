import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";

// No list prices (Bex, 23 Nov: "hide the old prices"): each business is
// quoted after the free first look, as /pricing says.
export const alt = "PortPass pricing — priced for your business, the first look is free";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgCard eyebrow="Pricing" title="Priced for your business. First look free." subtitle="We set the price after the first look, once we know what needs fixing. Prices in Bahamian dollars." />,
    { ...size, fonts: await ogFonts() },
  );
}
