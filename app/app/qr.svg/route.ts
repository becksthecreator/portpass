import { encodeText, qrToSvg } from "@/lib/qr";

// The QR on signs and flyers: it points at /app itself (with a UTM tag so
// scans show up in analytics as their own source). Vector, so it prints
// sharp at any size; generated in-repo by lib/qr.ts, never fetched from a
// third party.
export const dynamic = "force-static";

const APP_QR_TARGET = "https://portpassbahamas.com/app?utm_source=qr";

export function GET() {
  const svg = qrToSvg(encodeText(APP_QR_TARGET, "M"), { border: 4 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
