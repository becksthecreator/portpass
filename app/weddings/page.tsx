import Link from "next/link";
import { getWeddingSiteSettings } from "@/db/weddingSite";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

// force-dynamic: reads live wedding-site data at request time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Weddings in The Bahamas | PortPass Bahamas",
  description: "Island ceremonies and vow renewals in The Bahamas, planned end to end: officiant, venue, photography, paperwork.",
};

export default async function WeddingsPage() {
  const settings = await getWeddingSiteSettings();

  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Weddings", href: "/weddings" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Weddings</div>
        <h1>Weddings in The Bahamas.</h1>
        <p>Island ceremonies and vow renewals, planned end to end: officiant, venue, photography, and paperwork.</p>
      </section>

      <div className="application-form">
        <div className="form-grid">
          <div className="full-field">
            <span>Bahamas Weddings By The Sea · Nassau</span>
            <p>{settings.yearsExperience} years officiating · {settings.reviewCount} five-star reviews · Antonio Beckford, licensed officiant<br />
            Four packages from $500 to $3,500 · <Link href="/weddings/bahamas-weddings-by-the-sea">See prices &amp; photos →</Link></p>
          </div>
        </div>
        <div className="form-submit">
          <p>More wedding businesses join PortPass as they come on board.</p>
          <Link className="primary-button" href="/weddings/bahamas-weddings-by-the-sea">Explore weddings →</Link>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
