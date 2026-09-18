import Link from "next/link";
import { InterestForm } from "../_components/InterestForm";

export const metadata = {
  title: "Venues | PortPass",
  description: "Beaches, halls, studios and private estates in The Bahamas — coming soon to PortPass.",
};

export default function VenuesPage() {
  return (
    <main className="form-page">
      <header className="site-header form-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/">Back home</Link>
      </header>
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Venues</div>
        <h1>We&rsquo;re building this.</h1>
        <p>Beaches, halls, studios and private estates across The Bahamas — browsable and bookable on PortPass. Tell us what you&rsquo;re looking for and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category="venues" placeholder="What kind of place are you looking for? (optional)" />
    </main>
  );
}
