import Link from "next/link";
import { BusinessLogo } from "./BusinessLogo";

// A category page lists businesses, not programs: one of these per live
// business, photograph filling the top half -- that's what keeps the page
// from reading as a heading on cream and nothing else. Prices and
// programs live on the business's own page; this only has to answer
// "is this open, and roughly what does it cost" before the click.
export function FeatureCard({
  photoUrl,
  photoAlt,
  label,
  name,
  logoUrl,
  brand,
  brandText,
  description,
  priceLabel,
  actionHref,
  actionLabel,
  wide,
}: {
  // null when the business has no photo it's allowed to show yet (see
  // withPhotoConsent in db/organizations.ts): the logo tile takes the slot
  // rather than a stock image of someone else's business.
  photoUrl: string | null;
  photoAlt: string;
  label: string;
  name: string;
  logoUrl?: string | null;
  brand: string;
  brandText: string;
  description: string;
  priceLabel: string | null;
  actionHref: string;
  actionLabel: string;
  wide?: boolean;
}) {
  return (
    <div className={`feature-card${wide ? " feature-card-wide" : ""}`} style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      {photoUrl ? (
        <img className="feature-card-photo" src={photoUrl} alt={photoAlt} loading="lazy" />
      ) : (
        <div className="feature-card-photo feature-card-photo-tile" aria-hidden="true">
          <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="lg" />
        </div>
      )}
      <div className="feature-card-body">
        <span className="feature-card-label">{label}</span>
        <div className="feature-card-heading">
          <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="sm" />
          <h3>{name}</h3>
        </div>
        {description && <p className="feature-card-description">{description}</p>}
        {priceLabel && <p className="feature-card-price">{priceLabel}</p>}
        <Link className="feature-card-button" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
