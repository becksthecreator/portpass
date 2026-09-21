import { notFound } from "next/navigation";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ppDisplay, ppSans } from "@/app/fonts";

// force-dynamic: reads live organization/offering data at request time.
export const dynamic = "force-dynamic";

const ORG_SLUG = "futprep";

export async function generateMetadata() {
  const listing = await getOrganizationListingBySlug(ORG_SLUG);
  if (!listing) return { title: "Futprep Athletics | PortPass Bahamas" };
  const { organization } = listing;
  const title = `${organization.name} | PortPass Bahamas`;
  const description = organization.oneLiner ?? organization.description ?? undefined;
  return {
    title,
    description,
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: "https://portpassbahamas.com/sports-fitness/futprep-athletics" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function FutprepOrganizationPage() {
  const listing = await getOrganizationListingBySlug(ORG_SLUG);
  if (!listing) notFound();

  return (
    <div className={`${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }, { label: listing.organization.name, href: "/sports-fitness/futprep-athletics" }]} />
      <OrganizationTemplate listing={listing} />
      <SiteFooter orgLine={`${listing.organization.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
