import Link from "next/link";
import { BusinessLogo } from "./blocks/BusinessLogo";

export type OpenNowCard = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brand: string;
  line: string;
  cta: string;
  href: string;
};

// The businesses that are genuinely open, as equal cards: logo, name, one
// live line (spots this week, years and reviews) and a button. Replaces
// the hero's rotating Futprep block and, below four businesses, the
// carousel -- two tiles in a carousel look like a broken carousel.
export function OpenNowCards({ cards }: { cards: OpenNowCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="open-now" id="open-now" aria-label="Open now on PortPass">
      <div className="carousel-header">
        <h2>Open now on PortPass.</h2>
      </div>
      <div className="open-now-grid">
        {cards.map((card) => (
          <article className="open-now-card" key={card.slug}>
            <div className="open-now-head">
              <BusinessLogo logoUrl={card.logoUrl} name={card.name} brand={card.brand} size="md" initialsOnly />
              <div>
                <span className="open-now-chip">Open now</span>
                <h3>{card.name}</h3>
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
