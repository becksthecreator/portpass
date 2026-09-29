import { ImageResponse } from "next/og";

// PNG app icons for the web manifest (/icons/192, /icons/512). Interim
// Harbour Signal tile (navy, white P) until app-icon-192.png and
// app-icon-512.png from PortPass-Logo-Files.zip are in public/brand/ and
// the manifest points at them instead.
// ?purpose=maskable draws the P at half height so it sits inside the safe
// zone (the inner 80%) whatever shape Android masks the tile to.
const SIZES = new Set([192, 512]);

export async function GET(request: Request, context: { params: Promise<{ size: string }> }) {
  const { size: raw } = await context.params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.get("purpose") === "maskable";

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
          fontSize: Math.round(size * (maskable ? 0.5 : 0.66)),
        }}
      >
        P
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
