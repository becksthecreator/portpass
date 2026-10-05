import Image from "next/image";
import Link from "next/link";
import { isOptimisableSrc } from "@/lib/images";
import type { Offering } from "@/db/organizations";
import { OFFERING_ACTION_LABEL, formatAgeRange, formatPrice } from "./format";

// Block 4 of 8 -- the cards, with prices. An offering with no price does
// not render here, mirroring the platform-level rule that an organization
// with no priced offering cannot publish at all: "enquire for pricing" is
// the thing this template replaces, not a state it can display.
//
// `bookHref` (brief 19, part A): where "Request to book" goes for an
// offering that can be asked for on PortPass (a price and no link of its
// own), or null. A page that doesn't take booking requests leaves it out.
export function OfferingsBlock({ offerings, bookHref }: { offerings: Offering[]; bookHref?: (offering: Offering) => string | null }) {
  const priced = offerings.filter((offering) => offering.priceCents !== null);
  if (priced.length === 0) return null;

  return (
    <section className={`tpl-offerings${priced.length === 4 ? " tpl-offerings-grid-4" : ""}`} id="offerings" aria-label="Prices">
      {priced.map((offering) => {
        const ageRange = formatAgeRange(offering.ageMin, offering.ageMax, offering.ageLabel);
        const imageAlt = offering.summary ? `${offering.name} — ${offering.summary}` : offering.name;
        const requestHref = !offering.actionUrl && bookHref ? bookHref(offering) : null;
        return (
          <div className={`tpl-offering-card${offering.isFeatured ? " tpl-offering-featured" : ""}`} key={offering.id}>
            {offering.isFeatured && <span className="tpl-offering-badge">Most chosen</span>}
            {offering.imageUrl &&
              (isOptimisableSrc(offering.imageUrl) ? (
                <Image className="tpl-offering-image" src={offering.imageUrl} alt={imageAlt} width={640} height={300} sizes="(max-width: 760px) 100vw, 380px" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a host next/image is not configured for
                <img className="tpl-offering-image" src={offering.imageUrl} alt={imageAlt} width={640} height={300} loading="lazy" decoding="async" />
              ))}
            <h2>{offering.name}</h2>
            {offering.summary && <p className="tpl-offering-summary">{offering.summary}</p>}
            <p className="tpl-offering-price">{formatPrice(offering.priceCents as number, offering.priceUnit)}</p>
            {ageRange && <p className="tpl-offering-ages">{ageRange}</p>}
            {offering.scheduleText && <p className="tpl-offering-schedule">{offering.scheduleText}</p>}
            {offering.inclusions.length > 0 && (
              <ul className="tpl-offering-includes">
                {offering.inclusions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {offering.actionUrl && (/^https?:\/\//i.test(offering.actionUrl) ? (
              // An external action (a wa.me link, a ticket site) opens in a
              // new tab so the listing stays where the visitor left it.
              <a className="tpl-offering-cta" href={offering.actionUrl} target="_blank" rel="noopener noreferrer">
                {OFFERING_ACTION_LABEL[offering.type]} {offering.name} <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link className="tpl-offering-cta" href={offering.actionUrl}>
                {OFFERING_ACTION_LABEL[offering.type]} {offering.name} <span aria-hidden="true">→</span>
              </Link>
            ))}
            {requestHref && (
              <Link className="tpl-offering-cta" href={requestHref} prefetch={false}>
                Request to book <span className="sr-only">{offering.name} </span><span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
