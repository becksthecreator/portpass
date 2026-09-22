import Link from "next/link";
import { BusinessLogo } from "./blocks/BusinessLogo";

// The chrome a business's own domain gets instead of PortPass's
// (SiteHeader/SiteFooter): its own name and logo, no PortPass categories,
// no breadcrumb. The blocks in between (Identity, Proof, Gallery,
// Offerings, ...) are identical either way -- this and SiteHeader/
// SiteFooter are the only things that ever differ by shell.
export function BusinessHeader({
  name,
  logoUrl,
  brand,
  primaryActionHref = "#offerings",
  primaryActionLabel = "See prices",
}: {
  name: string;
  logoUrl?: string | null;
  brand: string;
  primaryActionHref?: string;
  primaryActionLabel?: string;
}) {
  return (
    <header className="biz-shell-header">
      <Link className="biz-shell-brand" href="/">
        <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="sm" />
        <span>{name}</span>
      </Link>
      <Link className="biz-shell-cta" href={primaryActionHref}>
        {primaryActionLabel}
      </Link>
    </header>
  );
}

const PORTPASS_URL = "https://portpassbahamas.com";

export function BusinessFooter({ name }: { name: string }) {
  return (
    <footer className="biz-shell-footer">
      <p className="biz-shell-footer-name">{name}</p>
      <p className="biz-shell-footer-credit">
        Booking and planning desk powered by <a href={PORTPASS_URL}>PortPass Bahamas</a>.
      </p>
    </footer>
  );
}
