import Link from "next/link";
import { ppDisplay, ppSans } from "./fonts";
import { ArrivalPlate } from "./ArrivalPlate";
import { HomeHero, type HeroFrame } from "./HomeHero";
import { getFutprepAvailability } from "@/db/registrations";
import { getWeddingSiteSettings } from "@/db/weddingSite";
import { programTimeRange } from "./futprep/config";

export const metadata = {
  title: "PortPass | Find and book it in The Bahamas",
  description: "PortPass is where you find and book things in The Bahamas — sports programs, weddings, and more.",
};

// force-dynamic: the hero reads live program and wedding-site data.
export const dynamic = "force-dynamic";

const COMING_LANES = [
  { slug: "venues", title: "Venues", tag: "Coming soon", copy: "Beaches, halls, studios and private estates." },
  { slug: "events", title: "Events", tag: "Coming soon", copy: "Ticketed nights, with entry and door scanning." },
  { slug: "entertainment", title: "Entertainment", tag: "Coming soon", copy: "Tours, attractions and nightlife." },
] as const;

export default async function Home() {
  const [availability, weddingSettings] = await Promise.all([
    getFutprepAvailability(),
    getWeddingSiteSettings(),
  ]);
  const futprepProgram = availability[0];

  const frames: HeroFrame[] = [
    futprepProgram && {
      world: "futprep" as const,
      chip: "Live now · Sports & Fitness",
      name: "Futprep Athletics",
      meta: `${futprepProgram.day}s ${programTimeRange(futprepProgram)} · ${futprepProgram.location}`,
      cta: "Register a child",
      href: "/futprep",
    },
    {
      world: "portpass" as const,
      chip: "Live now · Weddings",
      name: "Bahamas Weddings By The Sea",
      meta: `${weddingSettings.yearsExperience} years · ${weddingSettings.reviewCount} five-star reviews · Nassau`,
      cta: "Plan a wedding",
      href: "/weddings/bahamas-by-the-sea",
    },
  ].filter((frame): frame is HeroFrame => Boolean(frame));

  const spotsThisWeek = availability.reduce((sum, program) => sum + program.spotsRemaining, 0);

  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`} data-world="portpass">
      <ArrivalPlate />
      <a className="home-skip-link" href="#chooser">Skip to browse</a>

      <HomeHero frames={frames} />

      <section className="home-chooser" id="chooser">
        <div className="home-section-heading">
          <span className="home-eyebrow">What PortPass covers</span>
          <h2>Pick your lane.</h2>
        </div>
        <div className="home-lane-grid">
          <Link className="home-lane home-lane-live" href="/sports-fitness">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Sports &amp; Fitness</h3>
            <p>Real Saturday sessions, real prices, open now.</p>
            <span className="home-lane-action">Explore →</span>
          </Link>
          <Link className="home-lane home-lane-live" href="/weddings">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Weddings</h3>
            <p>Plan an island ceremony, start to finish.</p>
            <span className="home-lane-action">Explore →</span>
          </Link>
          {COMING_LANES.map((lane) => (
            <Link className="home-lane home-lane-coming" href={`/${lane.slug}`} key={lane.slug}>
              <span className="home-lane-tag">{lane.tag}</span>
              <h3>{lane.title}</h3>
              <p>{lane.copy}</p>
              <span className="home-lane-action">Tell us what you need →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-editorial">
        <div className="home-section-heading">
          <span className="home-eyebrow">Not a mockup</span>
          <h2>Running right now, side by side.</h2>
        </div>
        <div className="home-editorial-grid">
          <div className="home-editorial-col">
            <span>Sports &amp; Fitness</span>
            <strong>{spotsThisWeek} spots open this Saturday</strong>
            <p>{futprepProgram ? `${futprepProgram.name}, ${futprepProgram.day}s ${programTimeRange(futprepProgram)} · ${futprepProgram.location}` : "Real Saturday football, straight from the database."}</p>
            <Link href="/futprep">Register a child →</Link>
          </div>
          <div className="home-editorial-col">
            <span>Weddings</span>
            <strong>{weddingSettings.reviewCount} five-star reviews</strong>
            <p>{weddingSettings.yearsExperience} years officiating island ceremonies in Nassau, The Bahamas.</p>
            <Link href="/weddings/bahamas-by-the-sea">Plan a wedding →</Link>
          </div>
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

      <footer className="home-footer">
        <div className="home-footer-brand">
          <Link className="home-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
          <p>Made in The Bahamas.</p>
        </div>
        <div className="home-footer-links">
          <a href="tel:+12424241262">+1 (242) 424-1262</a>
          <Link href="/apply">Apply for early access →</Link>
        </div>
      </footer>
    </main>
  );
}
