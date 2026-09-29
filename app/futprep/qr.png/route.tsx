import { ImageResponse } from "next/og";
import { FUTPREP_LINKS } from "@/lib/attribution";
import { encodeText, qrToSvg } from "@/lib/qr";

// Print-ready QR for the Futprep Term 2 field banner: a 1200 px PNG of
// the tagged /futprep link (utm_source=portpass&utm_medium=qr), which is
// what makes a registration from a scan attributable to PortPass. The code
// is generated in-repo by lib/qr.ts; nothing is fetched from a third party.
export const dynamic = "force-static";

const SIZE = 1200;

export function GET() {
  const svg = qrToSvg(encodeText(FUTPREP_LINKS.qrBanner, "M"), { border: 4 });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: SIZE, height: SIZE, display: "flex", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={SIZE} height={SIZE} alt="" />
      </div>
    ),
    { width: SIZE, height: SIZE, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
