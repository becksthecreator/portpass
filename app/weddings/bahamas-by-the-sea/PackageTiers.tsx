"use client";

import { useState } from "react";
import Link from "next/link";
import type { PublicWeddingPackage } from "@/db/weddingPackages";

const CEREMONY_TYPES = [
  { value: "Wedding ceremony", label: "Your wedding" },
  { value: "Intimate wedding", label: "Just the two of you" },
  { value: "Vow renewal", label: "Vow renewal" },
];

// Antonio's prices are dollar amounts (BSD is pegged 1:1 to USD and uses
// the same "$" glyph), but Intl's currency formatter doesn't ship a "$"
// mapping for the less-common BSD code in every runtime -- it falls back
// to printing "BSD 500" instead of "$500". These are always dollars, so
// the symbol is fixed rather than derived from the currency code.
function money(cents: number) {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(cents / 100)}`;
}

const VOW_RENEWAL_PRICE_CENTS = 30000;

export function PackageTiers({ packages }: { packages: PublicWeddingPackage[] }) {
  const [ceremonyType, setCeremonyType] = useState(CEREMONY_TYPES[0].value);
  const isVowRenewal = ceremonyType === "Vow renewal";

  return (
    <>
      <div className="bws-ceremony-toggle" role="group" aria-label="What are you planning?">
        {CEREMONY_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={ceremonyType === option.value}
            onClick={() => setCeremonyType(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {isVowRenewal ? (
        // A vow renewal isn't a legal ceremony, so the six licence-inclusive
        // packages don't apply -- Antonio's confirmed rate is a single flat
        // price, not a tier ladder.
        <div className="bws-tier-grid bws-tier-grid-single">
          <div className="bws-tier-card">
            <h3>Standard vow renewal</h3>
            <p className="bws-tier-tagline">Antonio as your officiant, at the water&rsquo;s edge</p>
            <p className="bws-tier-price">{money(VOW_RENEWAL_PRICE_CENTS)}</p>
            <Link
              className="bws-text-link"
              href={`/weddings/bahamas-by-the-sea/plan?ceremony=${encodeURIComponent(ceremonyType)}`}
            >
              Choose vow renewal <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bws-tier-grid">
          {packages.map((pkg) => (
            <div className={`bws-tier-card${pkg.isFeatured ? " bws-tier-featured" : ""}`} key={pkg.id}>
              {pkg.isFeatured && <span className="bws-tier-badge">Most chosen</span>}
              {pkg.imageUrl && <img className="bws-tier-image" src={pkg.imageUrl} alt="" loading="lazy" />}
              <h3>{pkg.name}</h3>
              {pkg.tagline && <p className="bws-tier-tagline">{pkg.tagline}</p>}
              <p className="bws-tier-price">
                {pkg.priceFromCents !== null
                  ? <>{pkg.priceNote === "from" ? "From " : ""}{money(pkg.priceFromCents)}</>
                  : "Ask the Wedding Desk"}
              </p>
              {pkg.includes.length > 0 && (
                <ul className="bws-tier-includes">
                  {pkg.includes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              <Link
                className="bws-text-link"
                href={`/weddings/bahamas-by-the-sea/plan?ceremony=${encodeURIComponent(ceremonyType)}&tier=${encodeURIComponent(pkg.slug)}`}
              >
                Choose {pkg.name} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          ))}
        </div>
      )}
      <p className="bws-tier-fineprint">
        Choosing one here doesn&rsquo;t confirm or book anything — it just tells the Wedding Desk where to start.
        {" "}Prices in Bahamian dollars (BSD), fixed 1:1 with USD.
      </p>
      {!isVowRenewal && <p className="bws-tier-price-note">This package gives assistance with applying for marriage license.</p>}
      <p className="bws-tier-bespoke">
        {isVowRenewal ? "Planning something larger?" : "Planning something larger, or something different?"} Antonio will quote it.
      </p>
      {/*
        The full configurator (venue/flowers/photography by the hour, a
        running total, "send to the Wedding Desk") is blocked -- Antonio
        hasn't supplied venue or flower prices, or decided whether a
        self-built wedding should price at component rates, at a premium
        over the equivalent package, or with its own base fee (see the
        brief's "pricing decision" section). Building that pricing engine
        on invented numbers would be worse than not having it. This band is
        the real, working option in the meantime: it hands off to the same
        planner every package CTA uses, with "Still exploring" pre-selected
        so nothing here implies a firm plan or a price that doesn't exist.
      */}
      {!isVowRenewal && (
        <div className="bws-build-your-own">
          <p className="bws-eyebrow">Something else in mind?</p>
          <h3>Plan your own wedding.</h3>
          <p>Start with Antonio as your officiant and build the day around it. Tell the Wedding Desk what you have in mind.</p>
          <Link className="bws-button bws-build-your-own-cta" href={`/weddings/bahamas-by-the-sea/plan?ceremony=${encodeURIComponent("Still exploring")}`}>
            Build your wedding <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </>
  );
}
