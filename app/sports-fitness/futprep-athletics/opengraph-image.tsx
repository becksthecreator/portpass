import { ImageResponse } from "next/og";

// A branded card rather than real photography: Futprep's own hero photos
// show children's faces and photo consent isn't confirmed yet (see the
// homepage brief's client-proof section), so nothing with a recognisable
// child goes into a link preview that gets shared broadly at a conference.
export const alt = "Futprep Athletics | PortPass";
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
          background: "linear-gradient(160deg,#124055 0%,#0e2334 60%,#091a27 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 3, color: "#fff" }}>FUTPREP ATHLETICS</div>
        </div>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 600, color: "#fff", lineHeight: 1.08, maxWidth: 900 }}>
          Football starts here. Growth goes further.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#9fc3d1", marginTop: 28, maxWidth: 780 }}>
          Programs, coaches and player development — powered by PortPass.
        </div>
      </div>
    ),
    { ...size },
  );
}
