// @public-route: asking a business for a booking needs no account.
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { formatPrice } from "@/app/_components/blocks/format";
import { BookingRequestForm } from "@/app/_components/bookings/BookingRequestForm";
import "@/app/_components/bookings/bookings.css";
import "@/app/_components/registration/registration-theme.css";
import { getBookableOffering } from "@/db/bookingRequests";
import { attributionFromRequest, EMPTY_ATTRIBUTION, type Attribution } from "@/lib/attribution";
import { lastBookableDay, quantityQuestion } from "@/lib/bookings/rules";
import { businessTheme, themeVars } from "@/lib/businessTheme";
import { nassauToday } from "@/lib/futprepTerms";

// The offering, its price and whether the business is public are read on
// every request.
export const dynamic = "force-dynamic";

type Params = Promise<{ category: string; slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// "Request to book" for one of a business's priced offerings (brief 19,
// part A): /<section>/<business>/book?offering=<slug>, in that business's
// colours. One screen: the date, the time, the details, and who is asking.
// Sending it books nothing and charges nothing; the business confirms.
async function load(params: Params, searchParams: SearchParams) {
  const [{ category, slug }, query] = await Promise.all([params, searchParams]);
  const offeringSlug = typeof query.offering === "string" ? query.offering.trim().toLowerCase().slice(0, 80) : "";
  if (!offeringSlug) return null;
  const found = await getBookableOffering(slug, offeringSlug).catch(() => null);
  if (!found || found.business.primaryCategory !== category) return null;
  return { category, slug, found, query };
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const loaded = await load(params, searchParams);
  if (!loaded) return { robots: { index: false, follow: false } };
  const { business, offering } = loaded.found;
  return {
    title: `Request to book | ${offering.name} · ${business.name}`,
    description: `Ask ${business.name} for a date for ${offering.name}. They confirm within a day.`,
    // A form, not a page for search results.
    robots: { index: false, follow: true },
  };
}

export default async function BookOfferingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const loaded = await load(params, searchParams);
  if (!loaded) notFound();
  const { category, slug, found, query } = loaded;
  const { business, offering } = found;
  const pageHref = `/${category}/${slug}`;

  // What this one request says about where the person came from (a tagged
  // link, another PortPass page). The server decides what it proves.
  const headerStore = await headers();
  const tags = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === "string") tags.set(key, value);
  const attribution: Attribution = attributionFromRequest({ searchParams: tags, referer: headerStore.get("referer"), ownHost: headerStore.get("host"), isOwnPath: (pathname) => pathname === pageHref || pathname.startsWith(`${pageHref}/`) }) ?? EMPTY_ATTRIBUTION;
  const today = nassauToday();

  return (
    <main className="registration-page biz-reg" style={themeVars(businessTheme(business.brandColor, business.theme)) as React.CSSProperties}>
      <header className="biz-reg-header">
        <Link className="biz-reg-portpass" href="/" aria-label="PortPass home"><BrandLogo /></Link>
        <Link className="biz-reg-business" href={pageHref}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a business's own logo, any size or host */}
          {business.logoUrl && <img src={business.logoUrl} alt="" width={44} height={44} />}
          <span><b>{business.name}</b><small>Booking request, on PortPass</small></span>
        </Link>
      </header>
      <div className="bkg-shell">
        <div className="eyebrow"><span className="eyebrow-dot" />Request to book</div>
        <h1>{offering.name}</h1>
        <p className="bkg-lede">Tell {business.name} when you&rsquo;d like it. They confirm within a day. Nothing is booked, and nothing is owed, until they do.</p>
        <div className="bkg-offer">
          <strong>{offering.name}</strong>
          <span>{formatPrice(offering.priceCents, offering.priceUnit)}</span>
          {(offering.summary || offering.leadTimeText) && <small>{[offering.summary, offering.leadTimeText].filter(Boolean).join(" · ")}</small>}
        </div>
        <BookingRequestForm
          business={{ slug: business.slug, name: business.name, pageHref }}
          offering={{ slug: offering.slug, name: offering.name, forChildren: offering.forChildren }}
          quantity={quantityQuestion(offering.priceUnit)}
          minDate={today}
          maxDate={lastBookableDay(today)}
          attribution={attribution}
        />
      </div>
    </main>
  );
}
