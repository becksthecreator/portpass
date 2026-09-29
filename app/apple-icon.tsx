import { ImageResponse } from "next/og";

// iOS home-screen icon (the file convention adds the <link
// rel="apple-touch-icon">). Interim Harbour Signal tile -- navy with the
// white P -- until icons/apple-touch-icon-180.png from
// PortPass-Logo-Files.zip is in public/brand/ and replaces this
// generator. iOS never composites transparency, so the navy fills the tile.
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
          background: "#0D1B3D",
          color: "#FFFFFF",
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
