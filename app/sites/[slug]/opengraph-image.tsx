import { ImageResponse } from "next/og";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { loadOgPhoto } from "@/lib/og/loadPhoto";
import { OrgOgCard } from "@/lib/og/OrgOgCard";

export const alt = "PortPass Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getOrganizationListingBySlug(slug).catch(() => null);
  const org = listing?.organization ?? null;
  const photo = await loadOgPhoto(org?.heroImageUrl ?? null);
  return new ImageResponse(
    <OrgOgCard name={org?.name ?? "PortPass Bahamas"} tagline={org?.oneLiner ?? null} photo={photo} />,
    { ...size },
  );
}
