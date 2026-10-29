import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { bizDisplay, ppSans } from "@/app/fonts";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import "@/app/_components/seo/seo.css";
import { businessJsonLd } from "@/lib/seo/jsonLd";
import { BwsListingMain, loadBwsListing } from "./BwsListing";


// ISR (speed brief, 29 Sept): five-minute cache, rebuilt on demand. The
// loaders fall back (settings defaults, no packages, no extras) so CI's
// credential-less build can prerender this route; Vercel's build has the database.
export const revalidate = 300;

const TITLE = "Bahamas Weddings By The Sea: Wedding officiant & planner in Nassau | PortPass";
const DESCRIPTION = "Antonio Beckford's island wedding ceremonies, summarized: prices, photos, and how to start planning.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://portpassbahamas.com/weddings/bahamas-weddings-by-the-sea" },
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/weddings/bahamas-weddings-by-the-sea" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// The only real BWS page (25 Sept brief, Part 2) -- the old bespoke page
// and its /sites/ duplicate are gone, redirected here. This page now carries
// what they had: real content, the photo gallery, real FAQ, and the planner
// as its own sub-route. It never had the old page's arrival-plate intro
// animation and doesn't gain one here -- that was a full-site brand moment
// for a standalone domain, not fitting for a page that also carries
// PortPass's own header/breadcrumb.
export default async function BahamasWeddingsListingPage() {
  const data = await loadBwsListing();
  const { offerings, extras } = data;

  return (
    <div className={`${bizDisplay.variable} ${ppSans.variable}`}>
      <JsonLd
        data={businessJsonLd(
          { name: "Bahamas Weddings By The Sea", path: "/weddings/bahamas-weddings-by-the-sea", section: "weddings", subcategory: null, description: "Wedding officiant and planner in Nassau: beach, resort and villa ceremonies, vow renewals and the marriage licence.", area: "Nassau", island: "New Providence", whatsappE164: "+12424241262", heroImageUrl: "/weddings/bahamas-by-the-sea/hero.jpg", logoUrl: null, websiteUrl: null, instagramHandle: null, googleBusinessUrl: null },
          offerings.map((offering) => ({ name: offering.name, type: "service" as const, summary: offering.summary, priceCents: offering.priceCents, priceUnit: offering.priceUnit, actionUrl: null })),
          extras.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
        )}
      />
      <SiteHeader breadcrumb={[{ label: "Weddings", href: "/weddings" }, { label: "Bahamas Weddings By The Sea", href: "/weddings/bahamas-weddings-by-the-sea" }]} />
      <BwsListingMain data={data} />
      <SiteFooter orgLine="Bahamas Weddings By The Sea · Booking and payments powered by PortPass" />
    </div>
  );
}
