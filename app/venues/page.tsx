import { InterestForm } from "../_components/InterestForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata = {
  title: "Venues in The Bahamas | PortPass Bahamas",
  description: "Beaches, halls, studios and private estates in The Bahamas — coming soon to PortPass.",
  robots: { index: false, follow: true },
};

export default function VenuesPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Venues", href: "/venues" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Venues</div>
        <h1>Venue listings are on their way.</h1>
        <p>Beaches, halls, studios and private estates across The Bahamas — browsable and bookable on PortPass. Tell us what you&rsquo;re looking for and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category="venues" placeholder="What kind of place are you looking for? (optional)" />
      <SiteFooter />
    </main>
  );
}
