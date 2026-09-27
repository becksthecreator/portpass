import { ImageResponse } from "next/og";

// The P mark as an iOS home-screen icon (the file convention adds the
// <link rel="apple-touch-icon">). iOS never composites transparency, so
// the coral fills the whole tile; the mark itself matches .brand-mark.
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
          background: "#e8794a",
          color: "#ffffff",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: 118,
          transform: "rotate(-7deg)",
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
