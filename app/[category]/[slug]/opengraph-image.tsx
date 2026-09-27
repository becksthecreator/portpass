import { ImageResponse } from "next/og";
import { getCategoryBySlug } from "@/db/categories";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { loadOgPhoto } from "@/lib/og/loadPhoto";
import { OrgOgCard } from "@/lib/og/OrgOgCard";

export const alt = "PortPass Bahamas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A business page gets its hero and name; a subcategory page gets the
// subcategory's name on the text card.
export default async function Image({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { slug } = await params;
  const listing = await getOrganizationListingBySlug(slug).catch(() => null);
  if (listing) {
    const org = listing.organization;
    const photo = await loadOgPhoto(org.heroImageUrl);
    return new ImageResponse(<OrgOgCard name={org.name} tagline={org.oneLiner} photo={photo} />, { ...size });
  }
  const category = await getCategoryBySlug(slug).catch(() => null);
  return new ImageResponse(
    <OrgOgCard name={category ? `${category.name} in The Bahamas` : "PortPass Bahamas"} tagline={category ? "Coming soon to PortPass" : null} photo={null} />,
    { ...size },
  );
}
