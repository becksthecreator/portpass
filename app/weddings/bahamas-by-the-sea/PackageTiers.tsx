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

// A vow renewal isn't a legal ceremony, so licence-specific inclusions
// don't apply -- filtered out client-side rather than stored as separate
// per-ceremony package rows.
function includesForCeremony(includes: string[], ceremonyType: string): string[] {
  if (ceremonyType !== "Vow renewal") return includes;
  return includes.filter((line) => !/licen[cs]e/i.test(line));
}

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
      <div className="bws-tier-grid">
        {packages.map((pkg) => (
          <div className={`bws-tier-card${pkg.isFeatured ? " bws-tier-featured" : ""}`} key={pkg.id}>
            {pkg.isFeatured && <span className="bws-tier-badge">Most chosen</span>}
            <h3>{pkg.name}</h3>
            {pkg.tagline && <p className="bws-tier-tagline">{pkg.tagline}</p>}
            <p className="bws-tier-price">
              {pkg.priceFromCents !== null
                ? <>{pkg.priceNote === "from" ? "From " : ""}{money(pkg.priceFromCents)}</>
                : "Ask the Wedding Desk"}
            </p>
            {pkg.priceFromCents !== null && !isVowRenewal && <p className="bws-tier-price-note">Marriage licence government fee not included.</p>}
            {pkg.includes.length > 0 && (
              <ul className="bws-tier-includes">
                {includesForCeremony(pkg.includes, ceremonyType).map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            <Link
              className="bws-text-link"
              href={`/weddings/bahamas-by-the-sea/plan?ceremony=${encodeURIComponent(ceremonyType)}&tier=${encodeURIComponent(pkg.slug)}`}
            >
              Start with this level <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ))}
      </div>
      <p className="bws-tier-fineprint">Choosing one here doesn&rsquo;t confirm or book anything — it just tells the Wedding Desk where to start.</p>
      <p className="bws-tier-bespoke">Planning something larger, or something different? Antonio will quote it.</p>
    </>
  );
}
