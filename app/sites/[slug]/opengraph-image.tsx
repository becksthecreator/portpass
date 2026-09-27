import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { OrgOgCard, type OgPhoto } from "@/lib/og/OrgOgCard";

export const alt = "PortPass Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hero photos here come from the database and can be anything an admin
// pasted: a /public path, a remote URL, a WebP. Only a JPEG/PNG that
// actually loads makes it onto the card; everything else falls back to the
// text card rather than a broken image or a failed render.
async function loadPhoto(heroUrl: string | null): Promise<OgPhoto | null> {
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

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getOrganizationListingBySlug(slug).catch(() => null);
  const org = listing?.organization ?? null;
  const photo = await loadPhoto(org?.heroImageUrl ?? null);
  return new ImageResponse(
    <OrgOgCard name={org?.name ?? "PortPass Bahamas"} tagline={org?.oneLiner ?? null} photo={photo} />,
    { ...size },
  );
}
