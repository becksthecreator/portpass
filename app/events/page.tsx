import Link from "next/link";
import { InterestForm } from "../_components/InterestForm";

export const metadata = {
  title: "Events | PortPass",
  description: "Ticketed nights with entry and door scanning — coming soon to PortPass.",
};

export default function EventsPage() {
  return (
    <main className="form-page">
      <header className="site-header form-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/">Back home</Link>
      </header>
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Events</div>
        <h1>We&rsquo;re building this.</h1>
        <p>Ticketed nights, with real entry and door scanning built in. Tell us what you&rsquo;d want to sell tickets to, or what you&rsquo;d want to attend, and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category="events" placeholder="What kind of event? (optional)" />
    </main>
  );
}
