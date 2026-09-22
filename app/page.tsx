import Link from "next/link";
import { ppDisplay, ppSans } from "./fonts";
import { ArrivalPlate } from "./ArrivalPlate";
import { HomeHero, type HeroFrame } from "./HomeHero";
import { BusinessCarousel } from "./_components/BusinessCarousel";
import { BusinessLogo } from "./_components/blocks/BusinessLogo";
import { directoryHref } from "./_components/blocks/directoryHref";
import { getFutprepAvailability } from "@/db/registrations";
import { getWeddingSiteSettings } from "@/db/weddingSite";
import { listPublishedOrganizations } from "@/db/organizations";
import { programTimeRange } from "./futprep/config";
import { SiteHeader } from "./_components/SiteHeader";
import { SiteFooter } from "./_components/SiteFooter";

// Title, description, and Open Graph/Twitter tags are inherited from the
// root layout -- they're identical for "/", so there's nothing to override.

// force-dynamic: the hero reads live program and wedding-site data.
export const dynamic = "force-dynamic";

const COMING_LANES = [
  { slug: "venues", title: "Venues", tag: "Coming soon", copy: "Beaches, halls, studios and private estates, held by the hour or the day.", now: "Add-ons priced as you build the booking." },
  { slug: "events", title: "Events", tag: "Coming soon", copy: "Ticketed nights with scanning at the door.", now: "You see who is in the room and what came through the gate." },
  { slug: "entertainment", title: "Entertainment", tag: "Coming soon", copy: "Tours, attractions and nightlife.", now: "Booked the same way as everything else on PortPass." },
] as const;

export default async function Home() {
  const [availability, weddingSettings, directory] = await Promise.all([
    getFutprepAvailability(),
    getWeddingSiteSettings(),
    listPublishedOrganizations(),
  ]);
  const futprepProgram = availability[0];
  const spotsThisWeek = availability.reduce((sum, program) => sum + program.spotsRemaining, 0);
  const sportsBusinesses = directory.filter((biz) => biz.primaryCategory === "sports-fitness");
  const weddingsBusinesses = directory.filter((biz) => biz.primaryCategory === "weddings");

  const frames: HeroFrame[] = [
    futprepProgram && {
      world: "futprep" as const,
      chip: "Open now",
      name: "Futprep Athletics",
      meta: `${futprepProgram.day}s ${programTimeRange(futprepProgram)} · ${futprepProgram.location} · ${spotsThisWeek} spots open`,
      cta: "Register a child",
      href: "/sports-fitness/futprep-athletics",
    },
    {
      world: "portpass" as const,
      chip: "Open now",
      name: "Bahamas Weddings By The Sea",
      meta: `${weddingSettings.yearsExperience} years · ${weddingSettings.reviewCount} five-star reviews · Nassau`,
      cta: "Plan a wedding",
      href: "/weddings/bahamas-weddings-by-the-sea",
    },
  ].filter((frame): frame is HeroFrame => Boolean(frame));

  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`} data-world="portpass">
      <ArrivalPlate />
      <a className="home-skip-link" href="#chooser">Skip to browse</a>

      <SiteHeader />
      <HomeHero frames={frames} />

      <BusinessCarousel businesses={directory} />

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
              <li>Book and pay online, no phone tag</li>
              <li>Your confirmation and details live in one place</li>
            </ol>
          </div>
          <div className="home-how-track">
            <h3>If you run a business</h3>
            <ol>
              <li>Your listing goes live with real availability and prices</li>
              <li>Customers register and pay themselves</li>
              <li>You see who&rsquo;s coming and what&rsquo;s been collected, on one screen</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="home-chooser" id="chooser">
        <div className="home-section-heading">
          <span className="home-eyebrow">What PortPass covers</span>
          <h2>Where do you want to go?</h2>
        </div>
        <div className="home-lane-grid">
          <div className="home-lane home-lane-live">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Sports &amp; Fitness</h3>
            <p>Youth training, camps and weekend sessions you register and pay for online.</p>
            <div className="home-lane-chips">
              {sportsBusinesses.map((biz) => (
                <Link key={biz.slug} href={directoryHref(biz.slug, biz.primaryCategory)} className="home-lane-chip">
                  <BusinessLogo logoUrl={biz.logoUrl} name={biz.name} brand={biz.brandColor ?? "#e8794a"} size="sm" />
                  <span>{biz.name}</span>
                </Link>
              ))}
            </div>
            <Link className="home-lane-action" href="/sports-fitness">Explore →</Link>
          </div>
          <div className="home-lane home-lane-live">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Weddings</h3>
            <p>Island ceremonies planned end to end: officiant, venue, photography, paperwork.</p>
            <div className="home-lane-chips">
              {weddingsBusinesses.map((biz) => (
                <Link key={biz.slug} href={directoryHref(biz.slug, biz.primaryCategory)} className="home-lane-chip">
                  <BusinessLogo logoUrl={biz.logoUrl} name={biz.name} brand={biz.brandColor ?? "#e8794a"} size="sm" />
                  <span>{biz.name}</span>
                </Link>
              ))}
            </div>
            <Link className="home-lane-action" href="/weddings">Explore →</Link>
          </div>
          {COMING_LANES.map((lane) => (
            <Link className="home-lane home-lane-coming" href={`/${lane.slug}`} key={lane.slug}>
              <span className="home-lane-tag">{lane.tag}</span>
              <h3>{lane.title}</h3>
              <p>{lane.copy}<span className="home-lane-now">{lane.now}</span></p>
              <span className="home-lane-action">Tell us what you need →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-business">
        <div>
          <span className="home-eyebrow">Run a club or a business?</span>
          <h2>List with PortPass.</h2>
          <p>Bring your organization onto the same system powering Futprep and Bahamas Weddings By The Sea.</p>
        </div>
        <Link className="home-button home-button-light" href="/apply">Learn more →</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
