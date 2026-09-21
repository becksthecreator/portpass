import { notFound } from "next/navigation";
import Script from "next/script";
import { getOfferingListingBySlug } from "@/db/organizations";
import { ProgramTemplate } from "@/app/_components/blocks/OfferingTemplate";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ppDisplay, ppSans } from "@/app/fonts";

export const dynamic = "force-dynamic";

const ORG_SLUG = "futprep";
const ORG_URL = "https://portpassbahamas.com/sports-fitness/futprep-athletics";

export async function generateMetadata({ params }: { params: Promise<{ offeringSlug: string }> }) {
  const { offeringSlug } = await params;
  const listing = await getOfferingListingBySlug(ORG_SLUG, offeringSlug);
  if (!listing) return { title: "Futprep Athletics | PortPass Bahamas" };
  const { offering } = listing;
  const ages = offering.ageMin !== null && offering.ageMax !== null ? `Ages ${offering.ageMin}-${offering.ageMax}` : "";
  const title = `Kids Football Classes ${ages ? `${ages} ` : ""}in Nassau, The Bahamas | Futprep ${offering.name.replace("Futprep ", "")}`;
  const description = offering.summary ?? undefined;
  return {
    title,
    description,
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url: `${ORG_URL}/${offeringSlug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function FutprepOfferingPage({ params }: { params: Promise<{ offeringSlug: string }> }) {
  const { offeringSlug } = await params;
  const listing = await getOfferingListingBySlug(ORG_SLUG, offeringSlug);
  if (!listing) notFound();

  const { organization, offering } = listing;
  const courseSchema = offering.priceCents !== null ? {
    "@context": "https://schema.org",
    "@type": "Course",
    name: offering.name,
    description: offering.summary ?? organization.oneLiner ?? undefined,
    provider: { "@type": "Organization", name: organization.name, sameAs: ORG_URL },
    offers: {
      "@type": "Offer",
      price: (offering.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: offering.actionUrl ? `https://portpassbahamas.com${offering.actionUrl}` : undefined,
    },
  } : null;

  return (
    <div className={`${ppDisplay.variable} ${ppSans.variable}`}>
      {courseSchema && (
        <Script id="offering-course-schema" type="application/ld+json">
          {JSON.stringify(courseSchema)}
        </Script>
      )}
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }, { label: organization.name, href: "/sports-fitness/futprep-athletics" }, { label: offering.name, href: `/sports-fitness/futprep-athletics/${offering.slug}` }]} />
      <ProgramTemplate listing={listing} />
      <SiteFooter orgLine={`${organization.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
