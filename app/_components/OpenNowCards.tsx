import Link from "next/link";
import { BusinessLogo } from "./blocks/BusinessLogo";

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
};

// What is genuinely bookable, as equal cards: logo, name, one live line
// (dates and price, spots this week, years and reviews) and a button.
// Anything with a closing date says how long is left (brief 18, A2).
// Replaces the hero's rotating Futprep block and, below four businesses,
// the carousel -- two tiles in a carousel look like a broken carousel.
export function OpenNowCards({ cards }: { cards: OpenNowCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="open-now" id="open-now" aria-label="Open now on PortPass">
      <div className="carousel-header">
        <h2>Open now on PortPass.</h2>
      </div>
      <div className="open-now-grid">
        {cards.map((card) => (
          <article className="open-now-card" key={card.key}>
            <div className="open-now-head">
              <BusinessLogo logoUrl={card.logoUrl} name={card.name} brand={card.brand} size="md" initialsOnly />
              <div>
                <span className={`open-now-chip${card.chip ? " open-now-chip-closing" : ""}`}>{card.chip ?? "Open now"}</span>
                <h3>{card.name}</h3>
                {card.by && <span className="open-now-by">{card.by}</span>}
              </div>
            </div>
            <p className="open-now-line">{card.line}</p>
            <Link className="home-button" href={card.href}>{card.cta} <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
