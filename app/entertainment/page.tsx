import Link from "next/link";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ENTERTAINMENT_SUBSECTIONS } from "./subsections";

export const metadata = {
  title: "Entertainment in The Bahamas | PortPass Bahamas",
  description: "Events, DJs and sound equipment in The Bahamas — coming soon to PortPass.",
  robots: { index: false, follow: true },
};

export default function EntertainmentPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Entertainment", href: "/entertainment" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Entertainment</div>
        <h1>Events, DJs and sound equipment.</h1>
        <p>Three ways to make a night happen in The Bahamas. Each opens as soon as it has listings &mdash; tell us what you need and we&rsquo;ll reach out when it does.</p>
      </section>
      <div className="subsection-grid">
        {ENTERTAINMENT_SUBSECTIONS.map((subsection) => (
          <Link className="subsection-card" href={`/entertainment/${subsection.slug}`} key={subsection.slug}>
            <span className="coming-soon-label">Coming soon</span>
            <h2>{subsection.name}</h2>
            <p>{subsection.blurb}</p>
            <b>Tell us what you need &rarr;</b>
          </Link>
        ))}
      </div>
      <SiteFooter />
    </main>
  );
}
