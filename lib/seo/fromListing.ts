import type { OrganizationListing } from "@/db/organizations";
import { businessJsonLd } from "./jsonLd";

// The structured data for a business page built on the organization
// template, from the listing the page already loaded.
export function listingJsonLd(listing: OrganizationListing, path: string) {
  const { organization: org, offerings, faqs } = listing;
  return businessJsonLd(
    {
      name: org.name,
      path,
      section: org.primaryCategory,
      subcategory: org.subcategory,
      description: org.oneLiner ?? org.description,
      area: org.area,
      island: org.island,
      phoneE164: org.phoneE164,
      whatsappE164: org.whatsappE164,
      heroImageUrl: org.heroImageUrl,
      logoUrl: org.logoUrl,
      websiteUrl: org.websiteUrl,
      instagramHandle: org.instagramHandle,
      googleBusinessUrl: org.googleBusinessUrl,
    },
    offerings.map((offering) => ({ name: offering.name, type: offering.type, summary: offering.summary, priceCents: offering.priceCents, termStart: offering.termStart, termEnd: offering.termEnd, eventDate: offering.eventDate, actionUrl: offering.actionUrl })),
    faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
  );
}

// The lowest real price a listing shows, for its description.
export function fromPriceCents(listing: OrganizationListing): number | null {
  const prices = listing.offerings.map((offering) => offering.priceCents).filter((price): price is number => price !== null);
  return prices.length ? Math.min(...prices) : null;
}
