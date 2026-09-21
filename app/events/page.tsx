import { InterestForm } from "../_components/InterestForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata = {
  title: "Events in The Bahamas | PortPass Bahamas",
  description: "Ticketed nights with entry and door scanning — coming soon to PortPass.",
  robots: { index: false, follow: true },
};

export default function EventsPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Events", href: "/events" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Events</div>
        <h1>Ticketed events are on their way.</h1>
        <p>Ticketed nights, with real entry and door scanning built in. Tell us what you&rsquo;d want to sell tickets to, or what you&rsquo;d want to attend, and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category="events" placeholder="What kind of event? (optional)" />
      <SiteFooter />
    </main>
  );
}
