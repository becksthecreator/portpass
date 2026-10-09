import Link from "next/link";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { listFutprepPrivateServices, listPublicCoachProfiles } from "@/db/coaches";
import { ATTRIBUTION_COOKIE, attributionFromRequest, EMPTY_ATTRIBUTION, mergeAttribution, parseAttributionCookie, type Attribution } from "@/lib/attribution";
import { bookingDescription, bookingTitle, coachShortName, readBookingParams } from "@/lib/bookingLink";
import { PrivateSessionBooking } from "../coaches/PrivateSessionBooking";
import "../coaches/booking-days.css";
import "./book.css";

// /futprep/book?coach=<slug>&service=<slug> (Brief 29, part D): the booking
// form as a page of its own, with the coach and the service already chosen,
// for a link sent on WhatsApp. An unknown slug is dropped and the form
// opens anyway. Attribution (brief 05) is read the way /futprep/register
// reads it: the first-party cookie merged with this link's own tags.
export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

// Once per request: generateMetadata and the page both ask.
const load = cache(async function load(searchParams: Promise<Query>) {
  const [query, { schemaReady, coaches }, services] = await Promise.all([searchParams, listPublicCoachProfiles(), listFutprepPrivateServices({ publishedOnly: true }).catch(() => [])]);
  const bookable = coaches.filter((c) => c.bookable && c.member_type === "coach");
  const params = readBookingParams({ coach: query.coach, service: query.service }, { coaches: bookable.map((c) => c.slug), services: services.map((s) => s.slug) });
  const coach = bookable.find((c) => c.slug === params.coachSlug) ?? null;
  return { query, schemaReady, bookable, services, params, coach };
});

async function readAttribution(query: Query): Promise<Attribution> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === "string") search.set(key, value);
  const incoming = attributionFromRequest({ searchParams: search, referer: headerStore.get("referer"), ownHost: headerStore.get("host") });
  return mergeAttribution(parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value), incoming) ?? EMPTY_ATTRIBUTION;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }) {
  const { coach, services, params } = await load(searchParams);
  const title = bookingTitle(coach);
  const description = bookingDescription(coach, services);
  const url = `https://portpassbahamas.com/futprep/book${params.coachSlug ? `?coach=${params.coachSlug}${params.serviceSlug ? `&service=${params.serviceSlug}` : ""}` : ""}`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "PortPass", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function FutprepBookPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { query, schemaReady, bookable, services, params, coach } = await load(searchParams);
  const attribution = await readAttribution(query);
  const bookingCoaches = bookable.map((c) => ({ id: c.id, displayName: c.display_name, workingDays: c.working_days ?? [], slots: c.availability.filter((s) => s.status === "available").map((s) => ({ id: s.id, date: s.availability_date, startTime: s.start_time, endTime: s.end_time, location: s.location })) }));
  const bookingServices = services.map((s) => ({ slug: s.slug, name: s.name, priceCents: s.priceCents, priceUnit: s.priceUnit, kind: s.kind, durationMinutes: s.durationMinutes, minChildren: s.minChildren, maxChildren: s.maxChildren, perChildCents: s.perChildCents }));

  return (
    <main className="futprep-book-page">
      <header className="futprep-team-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <nav><Link href="/futprep/coaches">All coaches</Link> <Link href="/sports-fitness/futprep-athletics">Futprep home</Link></nav>
      </header>
      <section className="futprep-book-intro">
        <span>Futprep Athletics</span>
        <h1>{coach ? <>Book a private session with <em>{coachShortName(coach)}</em>.</> : <>Book a private <em>session</em>.</>}</h1>
        {params.unknown.length > 0 && <p className="futprep-book-note" role="status">{params.unknown.length === 2 ? "We couldn't find that coach or that session, so pick below." : params.unknown.includes("coach") ? "We couldn't find that coach, so pick one below." : "That session isn't offered right now, so pick one below."}</p>}
      </section>
      <PrivateSessionBooking inline coaches={bookingCoaches} services={bookingServices} schemaReady={schemaReady} preferredCoachId={coach?.id} preferredServiceSlug={params.serviceSlug} attribution={attribution} />
      <footer className="futprep-team-footer">
        <span>Futprep Athletics · Booking and payments powered by PortPass</span>
      </footer>
    </main>
  );
}
