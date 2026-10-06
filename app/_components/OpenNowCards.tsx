import Link from "next/link";
import { BusinessLogo } from "./blocks/BusinessLogo";
import { Reveal } from "./motion/Reveal";

export type OpenNowCard = {
  // One per card: a business has one, and so does each dated offer of its.
  key: string;
  slug: string;
  name: string;
  // The business behind a dated offer ("Futprep Athletics"), under its name.
  by?: string | null;
  // "Closes in 10 days" on an offer with a closing date; "Open now" otherwise.
  chip?: string | null;
  // When registration closes, for the order (lib/openNow.ts).
  closesAt?: string | null;
  logoUrl: string | null;
  brand: string;
  line: string;
  cta: string;
  href: string;
  // Brief 22 (M3): a card that leads to a child's details (registering a
  // child, a children's camp) never squishes, lifts or pops its chip.
  still?: boolean;
};

// What is genuinely bookable, as equal cards: logo, name, one live line
// (dates and price, spots this week, years and reviews) and a button.
// Anything with a closing date says how long is left (brief 18, A2).
// Replaces the hero's rotating Futprep block and, below four businesses,
// the carousel -- two tiles in a carousel look like a broken carousel.
//
// Brief 22 (M3): the grid is a stagger, so the cards rise in 60 ms apart
// as it comes into view. Each card sits in its own slot: the slot carries
// the reveal, the card its own hover lift (lib/motion/public.css).
export function OpenNowCards({ cards }: { cards: OpenNowCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="open-now" id="open-now" aria-label="Open now on PortPass">
      <div className="carousel-header">
        <h2>Open now on PortPass.</h2>
      </div>
      <Reveal className="open-now-grid" variant="rise" stagger>
        {cards.map((card) => (
          <div className="open-now-slot" key={card.key}>
            <article className="open-now-card" data-still={card.still ? "" : undefined}>
              <div className="open-now-head">
                <BusinessLogo logoUrl={card.logoUrl} name={card.name} brand={card.brand} size="md" initialsOnly />
                <div>
                  <span className={`open-now-chip${card.chip ? " open-now-chip-closing" : ""}`}>{card.chip ?? "Open now"}</span>
                  <h3>{card.name}</h3>
                  {card.by && <span className="open-now-by">{card.by}</span>}
                </div>
              </div>
              <p className="open-now-line">{card.line}</p>
              <Link className="home-button" href={card.href} data-still={card.still ? "" : undefined}>{card.cta} <span aria-hidden="true">→</span></Link>
            </article>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
