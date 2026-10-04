// @public-route: registering for a business's class or camp needs no account.
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { BusinessRegistrationForm } from "@/app/_components/registration/BusinessRegistrationForm";
import "@/app/_components/registration/registration-theme.css";
import { getRegistrationBusiness } from "@/db/registrationBusiness";
import { getFutprepOffer, listFutprepOffers, type FutprepAvailability } from "@/db/registrations";
import { attributionFromRequest, EMPTY_ATTRIBUTION, type Attribution } from "@/lib/attribution";
import { businessTheme, themeVars } from "@/lib/businessTheme";
import { offerHeadline } from "@/lib/futprepTerms";

// Spots left and the open terms are per-request.
export const dynamic = "force-dynamic";

type Params = Promise<{ category: string; slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Registration for any business, in that business's colours (brief 18,
// part D): /<section>/<business>/register?program=<slug>&term=<id>. The
// same programmes, terms, camps, age rules, caps and waitlist as
// Futprep's form, from the same tables. Futprep keeps /futprep/register.
async function load(params: Params, searchParams: SearchParams) {
  const [{ category, slug }, query] = await Promise.all([params, searchParams]);
  const business = await getRegistrationBusiness(slug).catch(() => null);
  if (!business || business.primaryCategory !== category) return null;
  const programSlug = typeof query.program === "string" ? query.program.trim().toLowerCase().slice(0, 40) : "";
  const termId = typeof query.term === "string" && /^\d+$/.test(query.term) ? Number(query.term) : null;
  const [offers, requested] = await Promise.all([
    listFutprepOffers({ publicOnly: true, organizationId: business.id }).catch((): FutprepAvailability[] => []),
    programSlug ? getFutprepOffer(programSlug, termId, { organizationId: business.id }).catch(() => null) : Promise.resolve(null),
  ]);
  // A direct link also opens a programme that isn't on the public list.
  const all = requested && !offers.some((o) => o.programId === requested.programId && o.termId === requested.termId) ? [requested, ...offers] : offers;
  return { category, slug, business, offers: all, requested, query };
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const loaded = await load(params, searchParams);
  if (!loaded) return { robots: { index: false, follow: false } };
  const { business, requested } = loaded;
  return {
    title: requested ? `Register | ${requested.name} · ${business.name}` : `Register | ${business.name}`,
    description: requested ? `Register for ${offerHeadline(requested)} with ${business.name}.` : `Register for a class or camp with ${business.name}.`,
    // A form, not a page for search results.
    robots: { index: false, follow: true },
  };
}

export default async function BusinessRegisterPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  // Futprep has its own form; an old or guessed link lands on it.
  if (slug === "futprep") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") query.set(key, value);
    redirect(`/futprep/register${query.size ? `?${query}` : ""}`);
  }
  const loaded = await load(params, searchParams);
  if (!loaded) notFound();
  const { business, offers, requested, query } = loaded;
  const pageHref = directoryHref(business.slug, business.primaryCategory);

  // What this one request says about where the person came from (a tagged
  // link, another PortPass page). The server decides what it proves.
  const headerStore = await headers();
  const tags = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === "string") tags.set(key, value);
  const attribution: Attribution = attributionFromRequest({ searchParams: tags, referer: headerStore.get("referer"), ownHost: headerStore.get("host"), isOwnPath: (pathname) => pathname === pageHref || pathname.startsWith(`${pageHref}/`) }) ?? EMPTY_ATTRIBUTION;

  return (
    <main className="registration-page biz-reg" style={themeVars(businessTheme(business.brandColor, business.theme)) as React.CSSProperties}>
      <header className="biz-reg-header">
        <Link className="biz-reg-portpass" href="/" aria-label="PortPass home"><BrandLogo /></Link>
        <Link className="biz-reg-business" href={pageHref}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a business's own logo, any size or host */}
          {business.logoUrl && <img src={business.logoUrl} alt="" />}
          <span><b>{business.name}</b><small>Registration, on PortPass</small></span>
        </Link>
      </header>
      <BusinessRegistrationForm
        business={{ slug: business.slug, name: business.name, pageHref, methods: business.methods, bank: business.bank }}
        offers={offers}
        initialOfferKey={requested ? `${requested.programId}:${requested.termId}` : null}
        attribution={attribution}
      />
    </main>
  );
}
