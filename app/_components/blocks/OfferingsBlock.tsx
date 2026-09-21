import Link from "next/link";
import type { Offering } from "@/db/organizations";
import { OFFERING_ACTION_LABEL, formatAgeRange, formatPrice } from "./format";

// Block 4 of 8 -- the cards, with prices. An offering with no price does
// not render here, mirroring the platform-level rule that an organization
// with no priced offering cannot publish at all: "enquire for pricing" is
// the thing this template replaces, not a state it can display.
export function OfferingsBlock({ offerings }: { offerings: Offering[] }) {
  const priced = offerings.filter((offering) => offering.priceCents !== null);
  if (priced.length === 0) return null;

  return (
    <section className="tpl-offerings" id="offerings" aria-label="Prices">
      {priced.map((offering) => {
        const ageRange = formatAgeRange(offering.ageMin, offering.ageMax);
        return (
          <div className={`tpl-offering-card${offering.isFeatured ? " tpl-offering-featured" : ""}`} key={offering.id}>
            {offering.isFeatured && <span className="tpl-offering-badge">Most popular</span>}
            {offering.imageUrl && <img className="tpl-offering-image" src={offering.imageUrl} alt="" loading="lazy" />}
            <h3>{offering.name}</h3>
            {offering.summary && <p className="tpl-offering-summary">{offering.summary}</p>}
            <p className="tpl-offering-price">{formatPrice(offering.priceCents as number, offering.priceUnit)}</p>
            {ageRange && <p className="tpl-offering-ages">{ageRange}</p>}
            {offering.scheduleText && <p className="tpl-offering-schedule">{offering.scheduleText}</p>}
            {offering.inclusions.length > 0 && (
              <ul className="tpl-offering-includes">
                {offering.inclusions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {offering.actionUrl && (
              <Link className="tpl-text-link" href={offering.actionUrl}>
                {OFFERING_ACTION_LABEL[offering.type]} {offering.name} <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
