import Link from "next/link";
import { ppDisplay, ppSans } from "./fonts";
import { ArrivalPlate } from "./ArrivalPlate";
import { HomeHero } from "./HomeHero";
import { BusinessCarousel } from "./_components/BusinessCarousel";
import { OpenNowCards, type OpenNowCard } from "./_components/OpenNowCards";
import { SectionGrid } from "./_components/SectionGrid";
import { DEFAULT_BRAND } from "./_components/blocks/brand";
import { categoryLabel } from "./_components/blocks/categoryLabel";
import { directoryHref } from "./_components/blocks/directoryHref";
import { getFutprepAvailability, type FutprepAvailability } from "@/db/registrations";
import { getWeddingSiteSettings, DEFAULT_SETTINGS, type WeddingSiteSettings } from "@/db/weddingSite";
import { listPublishedOrganizations, liveCountsByCategory, type OrganizationDirectoryEntry } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { programTimeRange } from "./futprep/config";
import { SiteHeader } from "./_components/SiteHeader";
import { SiteFooter } from "./_components/SiteFooter";

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
  const [availability, weddingSettings, directory] = await Promise.all([
    safeAvailability(),
    safeWeddingSettings(),
    safeDirectory(),
  ]);
  // The Saturday-class line: camps have their own page and card.
  const termClasses = availability.filter((offer) => offer.programType === "term");
  const futprepProgram = termClasses[0];
  const spotsThisWeek = termClasses.reduce((sum, program) => sum + program.spotsRemaining, 0);
  const liveSlugs = await safeLiveSections(directory);

  // The two businesses that are live today get their real numbers; anyone
  // who joins later gets their one-liner and an "Explore" button until
  // their own live line exists.
  const cards: OpenNowCard[] = directory.map((biz) => {
    const base = {
      slug: biz.slug,
      name: biz.name,
      logoUrl: biz.logoUrl,
      brand: biz.brandColor ?? DEFAULT_BRAND,
      href: directoryHref(biz.slug, biz.primaryCategory),
    };
    if (biz.slug === "futprep" && futprepProgram) {
      return { ...base, line: `${futprepProgram.day}s ${programTimeRange(futprepProgram)} · ${futprepProgram.location} · ${spotsThisWeek} spots open`, cta: "Register a child" };
    }
    if (biz.slug === "bahamas-weddings") {
      return { ...base, line: `${weddingSettings.yearsExperience} years · ${weddingSettings.reviewCount} five-star reviews · Nassau`, cta: "Plan a wedding" };
    }
    return { ...base, line: biz.oneLiner ?? (biz.primaryCategory ? categoryLabel(biz.primaryCategory) ?? "" : ""), cta: "Explore" };
  });

  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`} data-world="portpass">
      <ArrivalPlate />
      <a className="home-skip-link" href="#chooser">Skip to browse</a>

      <SiteHeader />
      <HomeHero />

      {directory.length >= CAROUSEL_FROM ? <BusinessCarousel businesses={directory} /> : <OpenNowCards cards={cards} />}

      <section className="home-chooser" id="chooser">
        <div className="home-section-heading">
          <span className="home-eyebrow">What PortPass covers</span>
          <h2>Where do you want to go?</h2>
        </div>
        <SectionGrid liveSlugs={liveSlugs} />
      </section>

      <section className="home-how" id="how-it-works">
        <div className="home-section-heading">
          <span className="home-eyebrow">How PortPass works</span>
          <h2>Two ways to use it.</h2>
        </div>
        <div className="home-how-grid">
          <div className="home-how-track">
            <h3>If you&rsquo;re booking</h3>
            <ol>
              <li>Find what you&rsquo;re looking for — sessions, ceremonies, venues</li>
              <li>Book online, no phone tag. Pay the way the business accepts, and keep one record of it</li>
              <li>Your confirmation and details live in one place</li>
            </ol>
          </div>
          <div className="home-how-track">
            <h3>If you run a business</h3>
            <ol>
              <li>Your listing goes live with real availability and prices</li>
              <li>Customers register themselves, and you see who&rsquo;s paid</li>
              <li>You see who&rsquo;s coming and what&rsquo;s been collected, on one screen</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="home-business">
        <div>
          <span className="home-eyebrow">Run a club or a business?</span>
          <h2>List with PortPass.</h2>
          <p>Bring your organization onto the same system powering Futprep and Bahamas Weddings By The Sea.</p>
        </div>
        <Link className="home-button home-button-light" href="/business">Learn more →</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
