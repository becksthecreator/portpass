import { notFound } from "next/navigation";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { bizDisplay, ppSans } from "@/app/fonts";
import { FutprepCampsCard } from "@/app/_components/FutprepCampsCard";
import { FutprepTasterCard } from "@/app/_components/FutprepTasterCard";
import { FutprepTeamGrid } from "@/app/_components/FutprepTeamGrid";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { RelatedInSection } from "@/app/_components/seo/RelatedInSection";
import { InOurGuides } from "@/app/guides/InOurGuides";
import "@/app/_components/seo/seo.css";
import { fromPriceCents, listingJsonLd } from "@/lib/seo/fromListing";
import { businessDescription, businessTitle } from "@/lib/seo/titles";

// ISR (speed brief, 29 Sept): five-minute cache, rebuilt on demand. The
// loader swallows a failed read so CI's credential-less build can still
// prerender this static route (it renders the 404 there; Vercel's build
// has the database).
export const revalidate = 300;

const ORG_SLUG = "futprep";

export async function generateMetadata() {
  const listing = await getOrganizationListingBySlug(ORG_SLUG).catch(() => null);
  if (!listing) return { title: "Futprep Athletics | PortPass Bahamas" };
  const { organization } = listing;
  const title = businessTitle(organization.name, "Kids' football programmes", organization.area, organization.island);
  const description = businessDescription(organization.name, organization.oneLiner ?? organization.description, fromPriceCents(listing));
  return {
    title,
    description,
    alternates: { canonical: "https://portpassbahamas.com/sports-fitness/futprep-athletics" },
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: "https://portpassbahamas.com/sports-fitness/futprep-athletics" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function FutprepOrganizationPage() {
  const listing = await getOrganizationListingBySlug(ORG_SLUG).catch(() => null);
  if (!listing) notFound();

  return (
    <div className={`${bizDisplay.variable} ${ppSans.variable}`}>
      <JsonLd data={listingJsonLd(listing, "/sports-fitness/futprep-athletics")} />
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }, { label: listing.organization.name, href: "/sports-fitness/futprep-athletics" }]} />
      <OrganizationTemplate listing={listing} />
      <FutprepTeamGrid />
      <FutprepTasterCard />
      <FutprepCampsCard />
      <RelatedInSection section="sports-fitness" sectionName="Sports & Fitness" exceptSlug="futprep" />
      <InOurGuides organizationSlug="futprep" />
      <SiteFooter orgLine={`${listing.organization.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
