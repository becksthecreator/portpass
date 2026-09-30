import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { RegistrationForm, type JoinQuote } from "./RegistrationForm";
import { getFutprepAvailability, getFutprepOffer, trialJoinQuote, type FutprepAvailability } from "@/db/registrations";
import { ATTRIBUTION_COOKIE, attributionFromRequest, EMPTY_ATTRIBUTION, mergeAttribution, parseAttributionCookie, type Attribution } from "@/lib/attribution";
import { shortDate, upcomingTaster } from "@/lib/futprepClasses";
import { nassauToday, offerHeadline } from "@/lib/futprepTerms";
import { normalizeProgramSlug } from "../config";

// force-dynamic: spots left, the open terms and the attribution cookie are
// all per-request.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ program?: string; term?: string; join?: string } & Record<string, string | string[] | undefined>>;

// "Join the rest of the term" after a free trial (brief 06 v2, Part C):
// ?join=<trial reference> prices the Saturdays left. An unknown code is
// ignored and the form works as usual.
async function loadJoinQuote(searchParams: SearchParams, offers: FutprepAvailability[]): Promise<JoinQuote | null> {
  const { join } = await searchParams;
  if (typeof join !== "string" || !/^FP-\d{4}-[A-Z0-9]{8}$/i.test(join)) return null;
  const quote = await trialJoinQuote(join).catch(() => null);
  if (!quote) return null;
  const offer = offers.find((o) => o.programId === quote.programId && o.termId === quote.termId);
  if (!offer) return null;
  return { code: join, offerKey: `${offer.programId}:${offer.termId}`, remainingSessions: quote.remainingSessions, amountCents: quote.amountCents, weeklyFeeCents: offer.weeklyFeeCents, childName: quote.childName };
}

// The canonical form is /futprep/register?program=<slug>&term=<id> (brief
// 06 v2, A1.5). The offers shown are every public open one, plus the one
// the link names even if its program is unlisted (is_public = false).
async function loadOffers(searchParams: SearchParams): Promise<{ offers: FutprepAvailability[]; requested: FutprepAvailability | null }> {
  const params = await searchParams;
  const slug = typeof params.program === "string" ? normalizeProgramSlug(params.program) : "";
  const termId = typeof params.term === "string" && /^\d+$/.test(params.term) ? Number(params.term) : null;
  const [offers, requested] = await Promise.all([
    getFutprepAvailability().catch(() => [] as FutprepAvailability[]),
    slug ? getFutprepOffer(slug, termId).catch(() => null) : Promise.resolve(null),
  ]);
  if (requested && !offers.some((o) => o.programId === requested.programId && o.termId === requested.termId)) {
    return { offers: [requested, ...offers], requested };
  }
  return { offers, requested };
}

// Growth tracking (28 Sept): what the 30-day first-party cookie remembers
// (set by middleware on every Futprep page), merged with anything this
// very request carries -- a parent who lands straight on the form from a
// tagged link has no cookie yet. Passed to the form as hidden values; the
// server decides what it proves.
async function readAttribution(searchParams: SearchParams): Promise<Attribution> {
  const [params, cookieStore, headerStore] = await Promise.all([searchParams, cookies(), headers()]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const incoming = attributionFromRequest({ searchParams: query, referer: headerStore.get("referer"), ownHost: headerStore.get("host") });
  return mergeAttribution(parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value), incoming) ?? EMPTY_ATTRIBUTION;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const { requested } = await loadOffers(searchParams);
  return {
    title: requested ? `Register | ${requested.name} · ${requested.termName}` : "Register | Futprep Athletics",
    description: requested ? `Register a child for ${offerHeadline(requested)}.` : "Register a child for a Futprep Athletics class or holiday camp.",
    robots: { index: false, follow: true },
  };
}

export default async function FutprepRegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ offers, requested }, attribution] = await Promise.all([loadOffers(searchParams), readAttribution(searchParams)]);
  const joinQuote = await loadJoinQuote(searchParams, offers);
  // Brief 12: the free taster Saturday, when one is coming up.
  const taster = upcomingTaster(offers, nassauToday());
  const programDetailsHref = requested?.programType === "camp" ? "/futprep/camps" : requested ? `/sports-fitness/futprep-athletics/${requested.slug}` : "/sports-fitness/futprep-athletics";

  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>{requested ? requested.name.toUpperCase() : "FUTPREP ATHLETICS"}</b><small>by Futprep Athletics</small></span></div>
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
          <Link className="header-link" href="/futprep/camps">Holiday camps</Link>
          <Link className="header-link" href={programDetailsHref}>{requested?.programType === "camp" ? "Camp details" : "Program details"}</Link>
        </div>
      </header>
      <Suspense fallback={null}>
        <RegistrationForm
          attribution={attribution}
          offers={offers}
          initialOfferKey={joinQuote ? joinQuote.offerKey : requested ? `${requested.programId}:${requested.termId}` : null}
          joinQuote={joinQuote}
          trialHref={taster && !joinQuote ? "/futprep/trial" : null}
          trialLabel={taster ? `Free taster Saturday, ${shortDate(taster.date)}` : null}
          intro={joinQuote ? { eyebrow: "Futprep · after the free taster", title: `Join the rest of the term.`, lead: `Keep ${joinQuote.childName.split(" ")[0]} playing for the ${joinQuote.remainingSessions} Saturdays left in the term. You pay only for those.` } : null}
        />
      </Suspense>
    </main>
  );
}
