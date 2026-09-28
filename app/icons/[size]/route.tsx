import { ImageResponse } from "next/og";

// PNG app icons for the web manifest (/icons/192, /icons/512). Same mark
// as apple-icon.tsx; generated rather than committed because there is no
// image tooling in this repo's workflow to produce PNGs by hand.
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
          background: "#e8794a",
          color: "#ffffff",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: Math.round(size * (maskable ? 0.5 : 0.66)),
          transform: "rotate(-7deg)",
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
