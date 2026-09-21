import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Distinct from PortPass's own coral "P" favicon (app/favicon.svg) -- a
// visitor with both tabs open should be able to tell them apart. Uses the
// same 🌴 placeholder as the arrival plate and header brand mark; swap
// this file when real BWS artwork exists.
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
          background: "#fbfaf5",
          fontSize: 22,
        }}
      >
        🌴
      </div>
    ),
    size,
  );
}
