import { ImageResponse } from "next/og";

// The P mark as an iOS home-screen icon (the file convention adds the
// <link rel="apple-touch-icon">). iOS never composites transparency, so
// the gold fills the whole tile; the mark itself matches .brand-mark
// (Aragonite brand, 28 Sept: gold tile, ink italic P).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFC21A",
          color: "#0B2A3C",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontWeight: 800,
          fontSize: 118,
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
