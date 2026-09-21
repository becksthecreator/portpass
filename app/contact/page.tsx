import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

const TITLE = "Contact | PortPass Bahamas";
const DESCRIPTION = "Get in touch with PortPass Bahamas.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/contact" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ContactPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Contact", href: "/contact" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Contact</div>
        <h1>Talk to us.</h1>
        <p>Questions about booking with one of our businesses, or about listing your own &mdash; either way, this is how to reach us.</p>
      </section>
      <article className="legal-body">
        <h2>General enquiries</h2>
        <p>
          Email: <a href="mailto:portpassbahamas@outlook.com">portpassbahamas@outlook.com</a><br />
          Phone: <a href="tel:+12424241262">+1 (242) 424-1262</a>
        </p>

        <h2>Booking a specific business</h2>
        <p>If your question is about a specific booking &mdash; a Futprep program or a Bahamas Weddings By The Sea ceremony &mdash; that business&rsquo;s own page has the fastest way to reach them directly.</p>

        <h2>Listing your business</h2>
        <p>If you run a Bahamian business and want to list with PortPass, start on our <a href="/apply">apply page</a> instead of here &mdash; it goes straight to the right form.</p>

        <h2>Where we&rsquo;re based</h2>
        <p>PortPass Bahamas Technologies, Nassau, The Bahamas.</p>
      </article>
      <SiteFooter />
    </main>
  );
}
