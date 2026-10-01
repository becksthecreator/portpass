import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";

const TITLE = "About | PortPass Bahamas";
const DESCRIPTION = "PortPass is a booking platform for independent Bahamian businesses.";

// ISR: the header now shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/about" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function AboutPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "About", href: "/about" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />About</div>
        <h1>Built in Nassau, for Bahamian businesses.</h1>
        <p>PortPass gives independent Bahamian businesses a real booking page and a record of every payment, instead of a phone number and a notebook.</p>
      </section>
      <article className="legal-body">
        <h2>What we do</h2>
        <p>PortPass is a booking platform. A business lists what it offers &mdash; a sports program, a wedding package, a venue, an event &mdash; with real prices. Customers book online and pay the business directly, by cash or bank transfer, and the business records every payment, instead of going back and forth over WhatsApp or a phone call. PortPass does not take card payments.</p>

        <h2>Who&rsquo;s live today</h2>
        <p>Futprep Athletics runs its Saturday football programs through PortPass, and Bahamas Weddings By The Sea runs its wedding packages through PortPass. We&rsquo;re early &mdash; two real businesses, not a long list padded out for show.</p>

        <h2>Where we&rsquo;re based</h2>
        <p>PortPass Bahamas Technologies is based in Nassau, The Bahamas.</p>

        <h2>Get in touch</h2>
        <p>
          Email: <a href={`mailto:${PORTPASS_SUPPORT_EMAIL}`}>{PORTPASS_SUPPORT_EMAIL}</a><br />
          Phone: <a href={`tel:${PORTPASS_PHONE_E164}`}>{PORTPASS_PHONE_DISPLAY}</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
