import { BusinessLogo } from "./BusinessLogo";

// A business mid-onboarding (a real organizations row, not yet published --
// see F1 of the 22 September brief) still deserves a place on its category
// page: a quiet card with the logo and name, no price, no button, since
// there's nothing to book yet. Sits in the same grid as FeatureCard.
export function ComingSoonCard({
  name,
  logoUrl,
  brand,
}: {
  name: string;
  logoUrl?: string | null;
  brand: string;
}) {
  return (
    <div className="coming-soon-card">
      <BusinessLogo logoUrl={logoUrl} name={name} brand={brand} size="lg" />
      <h3>{name}</h3>
      <span className="coming-soon-label">Coming soon</span>
    </div>
  );
}
