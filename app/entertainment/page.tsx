import Link from "next/link";
import { InterestForm } from "../_components/InterestForm";

export const metadata = {
  title: "Entertainment | PortPass",
  description: "Tours, attractions and nightlife in The Bahamas — coming soon to PortPass.",
};

export default function EntertainmentPage() {
  return (
    <main className="form-page">
      <header className="site-header form-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/">Back home</Link>
      </header>
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Entertainment</div>
        <h1>We&rsquo;re building this.</h1>
        <p>Tours, attractions and nightlife across The Bahamas. Tell us what you&rsquo;re looking for and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category="entertainment" placeholder="What kind of thing are you looking for? (optional)" />
    </main>
  );
}
