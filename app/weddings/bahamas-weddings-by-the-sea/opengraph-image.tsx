import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OrgOgCard } from "@/lib/og/OrgOgCard";

export const alt = "Bahamas Weddings By The Sea | PortPass Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // A single process.cwd()-joined literal path, so Vercel's file tracer
  // ships the JPEG with this function; the page's own hero (bws-10.webp)
  // can't be used here because Satori doesn't decode WebP.
  const data = await readFile(join(process.cwd(), "public/weddings/bahamas-by-the-sea/hero.jpg")).catch(() => null);
  return new ImageResponse(
    (
      <OrgOgCard
        name="Bahamas Weddings By The Sea"
        tagline="Beach ceremonies and vow renewals in Nassau, with Antonio Beckford"
        photo={data ? { data, mime: "image/jpeg" } : null}
      />
    ),
    { ...size },
  );
}
