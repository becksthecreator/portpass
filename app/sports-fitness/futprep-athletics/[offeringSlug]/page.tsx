import { notFound } from "next/navigation";
import { getOfferingListingBySlug } from "@/db/organizations";
import { ProgramTemplate } from "@/app/_components/blocks/OfferingTemplate";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { bizDisplay, ppSans } from "@/app/fonts";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { absoluteUrl, offerPrice } from "@/lib/seo/jsonLd";

// ISR (speed brief, 29 Sept): five-minute cache, rebuilt on demand; no
// build-time prerender (the params list is empty), so CI's credential-less
// build never has to reach the database.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

const ORG_SLUG = "futprep";
const ORG_URL = "https://portpassbahamas.com/sports-fitness/futprep-athletics";

export async function generateMetadata({ params }: { params: Promise<{ offeringSlug: string }> }) {
  const { offeringSlug } = await params;
  const listing = await getOfferingListingBySlug(ORG_SLUG, offeringSlug).catch(() => null);
  if (!listing) return { title: "Futprep Athletics | PortPass Bahamas" };
  const { offering } = listing;
  const ages = offering.ageLabel ? `Ages ${offering.ageLabel}` : offering.ageMin !== null && offering.ageMax !== null ? `Ages ${offering.ageMin}-${offering.ageMax}` : "";
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
  const listing = await getOfferingListingBySlug(ORG_SLUG, offeringSlug).catch(() => null);
  if (!listing) notFound();

  const { organization, offering } = listing;
  const courseSchema = offering.priceCents !== null ? {
    "@context": "https://schema.org",
    "@type": "Course",
    name: offering.name,
    description: offering.summary ?? organization.oneLiner ?? undefined,
    provider: { "@type": "Organization", name: organization.name, sameAs: ORG_URL },
    // The price as the page shows it ("$35 per session"), as on the
    // business page; nothing about places left, which the page doesn't say.
    offers: {
      "@type": "Offer",
      ...offerPrice(offering),
      url: offering.actionUrl ? absoluteUrl(offering.actionUrl) : undefined,
    },
  } : null;

  return (
    <div className={`${bizDisplay.variable} ${ppSans.variable}`}>
      {courseSchema && (
        <JsonLd data={courseSchema} />
      )}
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }, { label: organization.name, href: "/sports-fitness/futprep-athletics" }, { label: offering.name, href: `/sports-fitness/futprep-athletics/${offering.slug}` }]} />
      <ProgramTemplate listing={listing} />
      <SiteFooter orgLine={`${organization.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
