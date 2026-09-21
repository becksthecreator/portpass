import { InterestForm } from "../_components/InterestForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata = {
  title: "Entertainment in The Bahamas | PortPass Bahamas",
  description: "Tours, attractions and nightlife in The Bahamas — coming soon to PortPass.",
  robots: { index: false, follow: true },
};

export default function EntertainmentPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Entertainment", href: "/entertainment" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Entertainment</div>
        <h1>Tours and attractions are on their way.</h1>
        <p>Tours, attractions and nightlife across The Bahamas. Tell us what you&rsquo;re looking for and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category="entertainment" placeholder="What kind of thing are you looking for? (optional)" />
      <SiteFooter />
    </main>
  );
}
