import Image from "next/image";
import Link from "next/link";
import { isOptimisableSrc } from "@/lib/images";
import { BusinessLogo } from "./BusinessLogo";
import { IdleLogo } from "../motion/IdleLogo";

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
  perkLabel,
  actionHref,
  actionLabel,
  wide,
  priority = false,
  featured = false,
  still: holdStill = false,
}: {
  // The first card on the page: its photo is the page's largest paint, so
  // it is fetched straight away instead of when it scrolls into view.
  priority?: boolean;
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
  // "Members: 10% off first booking": the business's live member perk
  // (brief 10), when it has one.
  perkLabel?: string | null;
  actionHref: string;
  actionLabel: string;
  wide?: boolean;
  // In the founders' homepage order (Admin -> Content): its vector logo
  // mark may idle on the category list (brief 22, M4).
  featured?: boolean;
  // Held still whatever it shows (a stand-in for a card that would show a
  // price; see CategoryPage).
  still?: boolean;
}) {
  // Brief 22 (M3): a card that shows a price or a perk holds still, its
  // button and its "Open now" label alike: no squish or spring next to
  // money (lib/motion/public.css reads data-still).
  const still = holdStill || Boolean(priceLabel || perkLabel);
  return (
    <div className={`feature-card${wide ? " feature-card-wide" : ""}`} data-still={still ? "" : undefined} style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      {photoUrl ? (
        isOptimisableSrc(photoUrl) ? (
          // Resized and served as AVIF/WebP (speed brief, 29 Sept, 1.5); the
          // class keeps the 220px crop, so nothing moves.
          <Image className="feature-card-photo" src={photoUrl} alt={photoAlt} width={1200} height={wide ? 380 : 220} sizes={wide ? "(max-width: 1200px) 100vw, 1200px" : "(max-width: 760px) 100vw, 50vw"} priority={priority} loading={priority ? undefined : "lazy"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a host next/image is not configured for
          <img className="feature-card-photo" src={photoUrl} alt={photoAlt} width={1200} height={wide ? 380 : 220} loading={priority ? "eager" : "lazy"} decoding="async" />
        )
      ) : (
        <div className="feature-card-photo feature-card-photo-tile" aria-hidden="true">
          <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="lg" />
        </div>
      )}
      <div className="feature-card-body">
        <span className="feature-card-label">{label}</span>
        <div className="feature-card-heading">
          {/* Brief 22 (M4): a featured listing's vector mark idles now and
              then (one at a time on the page, only while in view). A raster
              logo, or a listing that is not featured, stays still. */}
          {featured && logoUrl && /\.svg(\?|$)/i.test(logoUrl) ? (
            <IdleLogo>
              <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="sm" />
            </IdleLogo>
          ) : (
            <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="sm" />
          )}
          <h2>{name}</h2>
        </div>
        {description && <p className="feature-card-description">{description}</p>}
        {priceLabel && <p className="feature-card-price">{priceLabel}</p>}
        {perkLabel && <span className="perk-chip">{perkLabel}</span>}
        <Link className="feature-card-button" href={actionHref} data-still={still ? "" : undefined}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
