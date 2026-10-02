// Structured data (schema.org JSON-LD) for PortPass's public pages (brief
// 11). Pure builders: they take what a page already loaded and return the
// object the page prints. Nothing here invents a fact: a field with no
// data is left out, and there is never an aggregateRating, because
// PortPass does not collect reviews (Terms: "PortPass does not collect
// reviews"; Google does not accept ratings copied from another site).

import { PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";

export const SITE_URL = "https://portpassbahamas.com";
export const SITE_NAME = "PortPass Bahamas";

type Json = Record<string, unknown>;

// Prints safely inside <script type="application/ld+json">: no "</script>"
// can close the tag early, whatever a business typed.
export function jsonLdString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const clean = <T extends Json>(object: T): T => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== "")) as T;

export const absoluteUrl = (path: string): string => (/^https?:\/\//i.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`);

// ---- The homepage ---------------------------------------------------------------------

export function homeJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/brand/icons/app-icon-512.png`,
        email: PORTPASS_SUPPORT_EMAIL,
        telephone: PORTPASS_PHONE_E164,
        areaServed: { "@type": "Country", name: "The Bahamas" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

// ---- A section or subsection page ------------------------------------------------------

export function sectionJsonLd(input: { name: string; path: string; description: string; businesses: Array<{ name: string; path: string }> }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: absoluteUrl(input.path),
    description: input.description,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
    ...(input.businesses.length
      ? { mainEntity: { "@type": "ItemList", itemListElement: input.businesses.map((business, index) => ({ "@type": "ListItem", position: index + 1, name: business.name, url: absoluteUrl(business.path) })) } }
      : {}),
  };
}

// ---- A business ---------------------------------------------------------------------

// The most specific schema.org type that fits the section. A type that is a
// place rather than a business is paired with LocalBusiness, so the page
// still counts as a local business.
const TYPE_FOR_SECTION: Record<string, string | string[]> = {
  "sports-fitness": "SportsActivityLocation",
  weddings: "LocalBusiness",
  venues: ["LocalBusiness", "EventVenue"],
  "event-venues": ["LocalBusiness", "EventVenue"],
  tours: ["LocalBusiness", "TouristAttraction"],
  boats: ["LocalBusiness", "TouristAttraction"],
  "fishing-charters": ["LocalBusiness", "TouristAttraction"],
  "food-tours": ["LocalBusiness", "TouristAttraction"],
  "land-tours": ["LocalBusiness", "TouristAttraction"],
  food: "FoodEstablishment",
  entertainment: "EntertainmentBusiness",
  shop: "Store",
  photography: "ProfessionalService",
  "photo-video": "ProfessionalService",
  "phone-tech-repair": "ElectronicsStore",
};

export function businessType(section: string | null, subcategory: string | null): string | string[] {
  return (subcategory ? TYPE_FOR_SECTION[subcategory] : undefined) ?? (section ? TYPE_FOR_SECTION[section] : undefined) ?? "LocalBusiness";
}

export type LdBusiness = {
  name: string;
  path: string;
  section: string | null;
  subcategory: string | null;
  description: string | null;
  area: string | null;
  island: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
  googleBusinessUrl: string | null;
};

export type LdOffering = {
  name: string;
  type: "program" | "event" | "venue" | "service";
  summary: string | null;
  priceCents: number | null;
  termStart: string | null;
  termEnd: string | null;
  eventDate: string | null;
  actionUrl: string | null;
};

export type LdFaq = { question: string; answer: string };

const money = (cents: number): string => (cents / 100).toFixed(2);

// "$35–$300" (Bahamian dollars, equal to US dollars).
export function priceRange(offerings: Array<Pick<LdOffering, "priceCents">>): string | undefined {
  const prices = offerings.map((o) => o.priceCents).filter((p): p is number => p !== null && p >= 0);
  if (!prices.length) return undefined;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
  return low === high ? dollars(low) : `${dollars(low)}–${dollars(high)}`;
}

function sameAs(business: LdBusiness): string[] {
  const links: string[] = [];
  if (business.instagramHandle) links.push(`https://www.instagram.com/${business.instagramHandle.replace(/^@/, "")}/`);
  if (business.websiteUrl) links.push(business.websiteUrl);
  if (business.googleBusinessUrl) links.push(business.googleBusinessUrl);
  return links;
}

// One business page: the business itself, what it offers with prices in
// Bahamian dollars, its programmes and events, and its questions and
// answers. Only offerings with a real price are offered.
export function businessJsonLd(business: LdBusiness, offerings: LdOffering[], faqs: LdFaq[] = []): Json {
  const url = absoluteUrl(business.path);
  const id = `${url}#business`;
  const priced = offerings.filter((o) => o.priceCents !== null && o.priceCents >= 0);
  const graph: Json[] = [
    clean({
      "@type": businessType(business.section, business.subcategory),
      "@id": id,
      name: business.name,
      url,
      description: business.description ?? undefined,
      image: [business.heroImageUrl, business.logoUrl].filter((u): u is string => Boolean(u)).map(absoluteUrl),
      logo: business.logoUrl ? absoluteUrl(business.logoUrl) : undefined,
      telephone: business.phoneE164 ?? business.whatsappE164 ?? undefined,
      address: { "@type": "PostalAddress", addressLocality: business.area ?? "Nassau", addressRegion: business.island ?? "New Providence", addressCountry: "BS" },
      areaServed: business.island ?? "New Providence",
      priceRange: priceRange(priced),
      sameAs: sameAs(business),
      makesOffer: priced.map((offering) =>
        clean({
          "@type": "Offer",
          name: offering.name,
          price: money(offering.priceCents as number),
          priceCurrency: "BSD",
          url: offering.actionUrl ? absoluteUrl(offering.actionUrl) : url,
          itemOffered: clean({
            "@type": offering.type === "program" ? "Course" : offering.type === "event" ? "Event" : "Service",
            name: offering.name,
            description: offering.summary ?? undefined,
            ...(offering.type === "program" ? { provider: { "@id": id } } : {}),
          }),
        }),
      ),
    }),
  ];
  // A programme with term dates, or an event with a date, is also an Event
  // in its own right: that is what search shows with dates.
  for (const offering of offerings) {
    const start = offering.type === "event" ? offering.eventDate : offering.type === "program" ? offering.termStart : null;
    if (!start) continue;
    graph.push(
      clean({
        "@type": "Event",
        name: `${offering.name}${offering.type === "program" ? ` (${business.name})` : ""}`,
        startDate: start,
        endDate: offering.type === "program" ? offering.termEnd ?? undefined : undefined,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: business.name, address: { "@type": "PostalAddress", addressLocality: business.area ?? "Nassau", addressRegion: business.island ?? "New Providence", addressCountry: "BS" } },
        organizer: { "@id": id },
        description: offering.summary ?? undefined,
        offers:
          offering.priceCents !== null
            ? { "@type": "Offer", price: money(offering.priceCents), priceCurrency: "BSD", url: offering.actionUrl ? absoluteUrl(offering.actionUrl) : url, availability: "https://schema.org/InStock" }
            : undefined,
      }),
    );
  }
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
