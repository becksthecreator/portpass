import { ImageResponse } from "next/og";

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
          background: "linear-gradient(160deg,#f6d2ac 0%,#efe7d9 55%,#d6ecea 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 44 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50% 50% 47% 53%",
              background: "#e8794a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontStyle: "italic",
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 6, color: "#14303d" }}>PORTPASS</div>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 600, color: "#14303d", lineHeight: 1.1, maxWidth: 920 }}>
          Everything worth booking in The Bahamas.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#43524f", marginTop: 28, maxWidth: 820 }}>
          Sports sessions, weddings, venues and events — found, booked and paid for in one place.
        </div>
      </div>
    ),
    { ...size },
  );
}
