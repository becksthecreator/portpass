import { ImageResponse } from "next/og";
import { BRAND, OG_LIGHT_BACKGROUND, PMark } from "@/lib/og/PMark";

export const alt = "PortPass | Find and book it in The Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -1.5, color: BRAND.ink, lineHeight: 1.08, maxWidth: 920 }}>
          Everything worth booking in The Bahamas.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: BRAND.muted, marginTop: 28, maxWidth: 820 }}>
          Sports sessions, weddings, venues and events — found and booked in one place.
        </div>
      </div>
    ),
    { ...size },
  );
}
