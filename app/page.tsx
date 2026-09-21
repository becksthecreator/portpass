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
  { slug: "venues", title: "Venues", tag: "Coming soon", copy: "Beaches, halls, studios and private estates, held by the hour or the day.", now: "Add-ons priced as you build the booking." },
  { slug: "events", title: "Events", tag: "Coming soon", copy: "Ticketed nights with scanning at the door.", now: "You see who is in the room and what came through the gate." },
  { slug: "entertainment", title: "Entertainment", tag: "Coming soon", copy: "Tours, attractions and nightlife.", now: "Booked the same way as everything else on PortPass." },
] as const;

export default async function Home() {
  const [availability, weddingSettings] = await Promise.all([
    getFutprepAvailability(),
    getWeddingSiteSettings(),
  ]);
  const futprepProgram = availability[0];
  const spotsThisWeek = availability.reduce((sum, program) => sum + program.spotsRemaining, 0);

  const frames: HeroFrame[] = [
    futprepProgram && {
      world: "futprep" as const,
      chip: "Open now",
      name: "Futprep Athletics",
      meta: `${futprepProgram.day}s ${programTimeRange(futprepProgram)} · ${futprepProgram.location} · ${spotsThisWeek} spots open`,
      cta: "Register a child →",
      href: "/futprep",
    },
    {
      world: "portpass" as const,
      chip: "Open now",
      name: "Bahamas Weddings By The Sea",
      meta: `${weddingSettings.yearsExperience} years · ${weddingSettings.reviewCount} five-star reviews · Nassau`,
      cta: "Plan a wedding →",
      href: "/weddings/bahamas-by-the-sea",
    },
  ].filter((frame): frame is HeroFrame => Boolean(frame));

  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`} data-world="portpass">
      <ArrivalPlate />
      <a className="home-skip-link" href="#chooser">Skip to browse</a>

      <HomeHero frames={frames} />

      <section className="home-chooser" id="chooser">
        <div className="home-section-heading">
          <span className="home-eyebrow">What PortPass covers</span>
          <h2>Where do you want to go?</h2>
        </div>
        <div className="home-lane-grid">
          <Link className="home-lane home-lane-live" href="/sports-fitness">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Sports &amp; Fitness</h3>
            <p>Youth training, camps and weekend sessions you register and pay for online.<span className="home-lane-now">Open now — Futprep Athletics, {spotsThisWeek} spots this Saturday.</span></p>
            <span className="home-lane-action">Explore →</span>
          </Link>
          <Link className="home-lane home-lane-live" href="/weddings">
            <span className="home-lane-tag home-lane-tag-live">Live now</span>
            <h3>Weddings</h3>
            <p>Island ceremonies planned end to end: officiant, venue, photography, paperwork.<span className="home-lane-now">Open now — Bahamas Weddings By The Sea, {weddingSettings.yearsExperience} years, {weddingSettings.reviewCount} five-star reviews.</span></p>
            <span className="home-lane-action">Explore →</span>
          </Link>
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
