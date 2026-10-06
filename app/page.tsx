import Link from "next/link";
import { ppDisplay, ppSans } from "./fonts";
import { ProwMoment } from "./_components/motion/ProwMoment";
import { HomeHero } from "./HomeHero";
import { BusinessCarousel } from "./_components/BusinessCarousel";
import { OpenNowCards, type OpenNowCard } from "./_components/OpenNowCards";
import { SectionGrid } from "./_components/SectionGrid";
import { Reveal } from "./_components/motion/Reveal";
import { DepartureBoard, type BoardCount } from "./_components/motion/DepartureBoard";
import { getSectionTiles } from "@/lib/navSections";
import { HomePerksRow } from "./_components/perks/HomePerksRow";
import { DEFAULT_BRAND } from "./_components/blocks/brand";
import { categoryLabel } from "./_components/blocks/categoryLabel";
import { directoryHref } from "./_components/blocks/directoryHref";
import { getFutprepAvailability, type FutprepAvailability } from "@/db/registrations";
import { getSiteContent } from "@/db/siteContent";
import { getWeddingSiteSettings, DEFAULT_SETTINGS, type WeddingSiteSettings } from "@/db/weddingSite";
import { listPublishedOrganizations, liveCountsByCategory, type OrganizationDirectoryEntry } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { orderBySpotlight } from "@/lib/siteContent";
import { programTimeRange } from "./futprep/config";
import { closesInLabel, datedOfferLine, openCountSentence, orderOpenNow } from "@/lib/openNow";
import "./phase1.css";
import { SiteHeader } from "./_components/SiteHeader";
import { SiteFooter } from "./_components/SiteFooter";
import { JsonLd } from "./_components/seo/JsonLd";
import { homeJsonLd } from "@/lib/seo/jsonLd";

// The homepage is the highest-traffic page on the site, and every one of
// these three queries is decoration on top of static page structure (the
// "Open now" card lines, the section grid's Live chips) -- not something
// worth a hard crash over. Found while investigating the 25 Sept /weddings
// outage (Part 1b): the same PGRST303 clock-skew rejection had ALSO been
// hitting listPublishedOrganizations() on this exact route, and
// getWeddingSiteSettings() here too. Same retry-then-fallback pattern as
// /weddings.
async function safeAvailability(): Promise<FutprepAvailability[]> {
  try {
    return await withOneRetry(() => getFutprepAvailability());
  } catch (error) {
    console.error("homepage: futprep availability fetch failed, using the generic card line", error);
    return [];
  }
}

async function safeWeddingSettings(): Promise<WeddingSiteSettings> {
  try {
    return await withOneRetry(() => getWeddingSiteSettings());
  } catch (error) {
    console.error("homepage: wedding site settings fetch failed, using defaults", error);
    return DEFAULT_SETTINGS;
  }
}

async function safeDirectory(): Promise<OrganizationDirectoryEntry[]> {
  try {
    return await withOneRetry(() => listPublishedOrganizations());
  } catch (error) {
    console.error("homepage: organization directory fetch failed, hiding the open-now cards", error);
    return [];
  }
}

// Which sections have something live, from the same counts the nav and
// the section pages use -- a business listed under a second section makes
// that section live too. Falls back to the directory's primary categories.
async function safeLiveSections(directory: OrganizationDirectoryEntry[]): Promise<Set<string>> {
  try {
    const counts = await withOneRetry(() => liveCountsByCategory());
    if (counts.size) return new Set(Array.from(counts).filter(([, n]) => n > 0).map(([slug]) => slug));
  } catch (error) {
    console.error("homepage: live counts failed, using primary categories", error);
  }
  return new Set(directory.map((biz) => biz.primaryCategory).filter((c): c is string => Boolean(c)));
}

// Title, description, and Open Graph/Twitter tags are inherited from the
// root layout -- they're identical for "/", so there's nothing to override.

// ISR (speed brief, 29 Sept): rendered once, cached five minutes, rebuilt on
// the next request; every listing write calls lib/revalidate.bumpListings()
// so edits still appear at once. Nothing here reads cookies or headers --
// the header's signed-in state is hydrated client-side (HeaderAccount).
export const revalidate = 300;

// Below this many businesses the carousel is replaced by equal cards.
const CAROUSEL_FROM = 4;

export default async function Home() {
  const [availability, weddingSettings, listed, content] = await Promise.all([
    safeAvailability(),
    safeWeddingSettings(),
    safeDirectory(),
    getSiteContent(),
  ]);
  // The order the founders chose in Admin -> Content; the rest follow.
  const directory = orderBySpotlight(listed, content.spotlight);
  // The Saturday-class line: camps have their own page and card.
  const termClasses = availability.filter((offer) => offer.programType === "term");
  const futprepProgram = termClasses[0];
  const spotsThisWeek = termClasses.reduce((sum, program) => sum + program.spotsRemaining, 0);
  const liveSlugs = await safeLiveSections(directory);

  // The two businesses that are live today get their real numbers; anyone
  // who joins later gets their one-liner and an "Explore" button until
  // their own live line exists.
  const businessCards: OpenNowCard[] = directory.map((biz) => {
    const base = {
      key: biz.slug,
      slug: biz.slug,
      name: biz.name,
      logoUrl: biz.logoUrl,
      brand: biz.brandColor ?? DEFAULT_BRAND,
      href: directoryHref(biz.slug, biz.primaryCategory),
    };
    if (biz.slug === "futprep" && futprepProgram) {
      // still: it leads to a child's registration, so the button never squishes.
      return { ...base, name: `${biz.name}: ${futprepProgram.day} sessions`, line: `${futprepProgram.day}s ${programTimeRange(futprepProgram)} · ${futprepProgram.location} · ${spotsThisWeek} spots open`, cta: "Register a child", still: true };
    }
    if (biz.slug === "bahamas-weddings") {
      return { ...base, line: `${weddingSettings.yearsExperience} years · ${weddingSettings.reviewCount} five-star reviews · Nassau`, cta: "Plan a wedding" };
    }
    return { ...base, line: biz.oneLiner ?? (biz.primaryCategory ? categoryLabel(biz.primaryCategory) ?? "" : ""), cta: "Explore" };
  });

  // Dated offers that are open for registration today (camps): each gets
  // its own card with its dates, price and how long is left. From the
  // data, so the next camp appears and the last one leaves on its own.
  const futprep = directory.find((biz) => biz.slug === "futprep");
  const datedCards: OpenNowCard[] = futprep
    ? availability
        .filter((offer) => offer.programType === "camp")
        .map((camp) => ({
          key: `futprep:${camp.slug}:${camp.termId}`,
          slug: futprep.slug,
          name: camp.name,
          by: futprep.name,
          logoUrl: futprep.logoUrl,
          brand: futprep.brandColor ?? DEFAULT_BRAND,
          href: "/futprep/camps",
          line: `${datedOfferLine(camp)}${camp.spotsRemaining === 0 ? " · full, waitlist open" : ""}`,
          cta: "See the camp",
          chip: closesInLabel(camp.registrationClosesAt),
          closesAt: camp.registrationClosesAt,
          // A children's camp: the button never squishes.
          still: true,
        }))
    : [];
  // Soonest to close first, then the businesses in the founders' order.
  const cards = orderOpenNow([...datedCards, ...businessCards]);
  const carousel = directory.length >= CAROUSEL_FROM;

  // The Departure Board (brief 22, M3): counts this page already reads, and
  // only those. Businesses open is the directory (the demo business can
  // never be listed); categories open are the top-level sections with a
  // live business; camps open are the camp offers taking sign-ups, the
  // same ones that get their own card above.
  const sectionsOpen = (await getSectionTiles()).filter((tile) => liveSlugs.has(tile.slug)).length;
  const boardCounts: BoardCount[] = [
    { value: directory.length, label: ["Business open", "Businesses open"] },
    { value: sectionsOpen, label: ["Category open", "Categories open"] },
    { value: datedCards.length, label: ["Camp open", "Camps open"] },
  ];

  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`} data-world="portpass">
      {/* Who PortPass is, and the site search (brief 11). */}
      <JsonLd data={homeJsonLd()} />
      <ProwMoment />
      <a className="home-skip-link" href="#chooser">Skip to browse</a>

      <SiteHeader />
      <HomeHero openSentence={openCountSentence(directory.length)} />
      <DepartureBoard counts={boardCounts} />

      {/* With a carousel of businesses, the dated offers still get their cards. */}
      <OpenNowCards cards={carousel ? orderOpenNow(datedCards) : cards} />
      {carousel && <BusinessCarousel businesses={directory} />}

      {/* Member perks (brief 10): hidden until three are live. */}
      <HomePerksRow />

      {/* Brief 22 (M1): the section headings rise in as they come into
          view. The sections' own contents follow in M3. */}
      <section className="home-chooser" id="chooser">
        <Reveal className="home-section-heading" variant="rise">
          <span className="home-eyebrow">What PortPass covers</span>
          <h2>Where do you want to go?</h2>
        </Reveal>
        <SectionGrid liveSlugs={liveSlugs} />
      </section>

      <section className="home-how" id="how-it-works">
        <Reveal className="home-section-heading" variant="rise">
          <span className="home-eyebrow">How PortPass works</span>
          <h2>Two ways to use it.</h2>
        </Reveal>
        {/* Brief 22 (M3): each track is a stagger; a line down its left
            draws as it scrolls into view and each number counts in. */}
        <div className="home-how-grid">
          <div className="home-how-track">
            <h3>If you&rsquo;re booking</h3>
            <div className="home-how-steps-wrap">
              <Reveal as="ol" className="home-how-steps" variant="rise" stagger>
                <li><span className="home-how-num">1</span><span>Find what you&rsquo;re looking for — sessions, ceremonies, venues</span></li>
                <li><span className="home-how-num">2</span><span>Book online, no phone tag. Pay the way the business accepts, and keep one record of it</span></li>
                <li><span className="home-how-num">3</span><span>Your confirmation and details live in one place</span></li>
              </Reveal>
              <svg className="home-how-line" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1 0 V100" pathLength="100" /></svg>
            </div>
          </div>
          <div className="home-how-track">
            <h3>If you run a business</h3>
            <div className="home-how-steps-wrap">
              <Reveal as="ol" className="home-how-steps" variant="rise" stagger>
                <li><span className="home-how-num">1</span><span>Your listing goes live with real availability and prices</span></li>
                <li><span className="home-how-num">2</span><span>Customers register themselves, and you see who&rsquo;s paid</span></li>
                <li><span className="home-how-num">3</span><span>You see who&rsquo;s coming and what&rsquo;s been collected, on one screen</span></li>
              </Reveal>
              <svg className="home-how-line" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1 0 V100" pathLength="100" /></svg>
            </div>
          </div>
        </div>
      </section>

      {/* Brief 22 (M3): deck until it enters, then the ink layer eases in
          and the words and the button arrive after it, the button last. */}
      <Reveal as="section" className="home-business" variant="rise" stagger>
        <div>
          <span className="home-eyebrow">Run a club or a business?</span>
          <h2>List with PortPass.</h2>
          <p>Bring your organization onto the same system powering Futprep and Bahamas Weddings By The Sea.</p>
        </div>
        <div className="home-business-action">
          <Link className="home-button home-button-light" href="/business">Learn more →</Link>
        </div>
      </Reveal>

      <SiteFooter />
    </main>
  );
}
