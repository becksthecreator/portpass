import { headers } from "next/headers";
import type { OgPhoto } from "./OrgOgCard";

// Hero photos come from the database and can be anything an admin pasted:
// a /public path, a remote URL, a WebP. Only a JPEG/PNG that actually loads
// makes it onto an Open Graph card; everything else falls back to the text
// card rather than a broken image or a failed render.
export async function loadOgPhoto(heroUrl: string | null): Promise<OgPhoto | null> {
  if (!heroUrl || !/\.(jpe?g|png)(\?.*)?$/i.test(heroUrl)) return null;
  let url = heroUrl;
  if (heroUrl.startsWith("/")) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    url = `${h.get("x-forwarded-proto") ?? "https"}://${host}${heroUrl}`;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const mime = type.includes("png") ? "image/png" : /jpe?g/.test(type) ? "image/jpeg" : null;
    if (!mime) return null;
    return { data: await res.arrayBuffer(), mime };
  } catch {
    return null;
  }
}
