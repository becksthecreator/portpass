import { ImageResponse } from "next/og";
import { cheapestSubscription } from "@/db/pricing";
import { OgCard } from "@/lib/og/OgCard";
import { ogFonts } from "@/lib/og/PMark";
import { dollars } from "@/lib/pricingFormat";

export const alt = "PortPass pricing — simple prices, 30 days free";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card for /pricing. The "from" price is read from pricing_plans
// like everything else, so the card never lags a price change.
export default async function Image() {
  const [cheapest, fonts] = await Promise.all([cheapestSubscription().catch(() => null), ogFonts()]);
  const subtitle = cheapest
    ? `Plans from ${dollars(cheapest.monthlyCents)}/month. Your page, bookings and payment records in one place. Prices in Bahamian dollars.`
    : "Your page, bookings and payment records in one place. Prices in Bahamian dollars.";
  return new ImageResponse(<OgCard eyebrow="Pricing" title="Simple prices. 30 days free." subtitle={subtitle} />, { ...size, fonts });
}
