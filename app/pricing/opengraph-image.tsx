import { ImageResponse } from "next/og";
import { cheapestSubscription } from "@/db/pricing";
import { dollars } from "@/lib/pricingFormat";
import { BRAND, OG_LIGHT_BACKGROUND, PMark } from "@/lib/og/PMark";

export const alt = "PortPass pricing — simple prices, 30 days free";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card for /pricing in the Aragonite brand. The "from" price is
// read from pricing_plans like everything else, so the card never lags a
// price change.
export default async function Image() {
  const cheapest = await cheapestSubscription().catch(() => null);
  const fromLine = cheapest ? `Plans from ${dollars(cheapest.monthlyCents)}/month · Prices in Bahamian dollars` : "Prices in Bahamian dollars";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: OG_LIGHT_BACKGROUND,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 44 }}>
          <PMark size={72} />
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 6, color: BRAND.ink }}>PORTPASS</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", fontSize: 68, fontWeight: 700, letterSpacing: -1.5, color: BRAND.ink, lineHeight: 1.08, maxWidth: 960 }}>
          <span style={{ marginRight: 20 }}>Simple prices.</span>
          <span style={{ background: BRAND.gold, padding: "0 18px", borderRadius: 14 }}>30 days free.</span>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: BRAND.muted, marginTop: 30, maxWidth: 880 }}>
          Your page, bookings and payment records in one place. We build it for you.
        </div>
        <div style={{ display: "flex", fontSize: 24, color: BRAND.tealDeep, fontWeight: 700, marginTop: 18 }}>{fromLine}</div>
      </div>
    ),
    { ...size },
  );
}
