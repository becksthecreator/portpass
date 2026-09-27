import Link from "next/link";
import { BusinessLogo } from "./BusinessLogo";

// A business mid-onboarding (a real organizations row, not yet published --
// see F1 of the 22 September brief) still deserves a place on its category
// page: a quiet card with the logo and name, no price, no button, since
// there's nothing to book yet. Sits in the same grid as FeatureCard. With
// notifyHref it also captures demand ("Get notified") instead of being a
// dead end.
export function ComingSoonCard({
  name,
  logoUrl,
  brand,
  notifyHref,
}: {
  name: string;
  logoUrl?: string | null;
  brand: string;
  notifyHref?: string | null;
}) {
  return (
    <div className="coming-soon-card">
      <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="lg" />
      <h3>{name}</h3>
      {notifyHref ? (
        <Link className="coming-soon-notify" href={notifyHref}>Coming soon · Get notified →</Link>
      ) : (
        <span className="coming-soon-label">Coming soon</span>
      )}
    </div>
  );
}
