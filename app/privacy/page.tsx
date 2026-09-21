import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata = {
  title: "Privacy Policy | PortPass Bahamas",
  description: "How PortPass Bahamas Technologies collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Privacy", href: "/privacy" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Effective September 2026</div>
        <h1>Privacy Policy.</h1>
        <p>PortPass Bahamas Technologies (&ldquo;PortPass,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) operates portpassbahamas.com and the booking pages of the businesses listed on it. This policy explains what we collect and why.</p>
      </section>
      <article className="legal-body">
        <h2>Information we collect</h2>
        <p>When you make an enquiry or a booking through PortPass, we collect what you give us directly: your name, email address, phone number, and details relevant to the booking (preferred dates, guest counts, ceremony or program preferences, and similar). If you apply to list a business with us, we collect your organization&rsquo;s name and your contact details.</p>
        <p>We do not collect payment card numbers ourselves. Where online payment is available on a listing, your card details are entered directly into a licensed third-party payment processor&rsquo;s own secure form and never pass through PortPass&rsquo;s systems.</p>

        <h2>How we use it</h2>
        <p>We use your information to process your enquiry or booking, put you in touch with the business you&rsquo;re booking with, send confirmations and updates about that booking, and respond to questions you send us. We do not sell your information to third parties.</p>

        <h2>Children&rsquo;s programs</h2>
        <p>Some listings on PortPass, including youth sports programs, are registered for by a parent or guardian on behalf of a child. We collect the information the registering adult provides about the child (name, age, and program-relevant details) solely to run that program, and we do not knowingly collect information directly from children.</p>

        <h2>Analytics</h2>
        <p>We use privacy-focused, cookieless analytics to understand which pages are visited and how many people visit them. This does not track you across other websites and does not use tracking cookies.</p>

        <h2>How long we keep it</h2>
        <p>We keep booking and enquiry records for as long as needed to provide the service and meet our accounting and legal obligations, then delete or anonymize them.</p>

        <h2>Your rights</h2>
        <p>You can ask us what information we hold about you, ask us to correct it, or ask us to delete it, by emailing us at the address below. We&rsquo;ll respond as quickly as we can.</p>

        <h2>Changes to this policy</h2>
        <p>If we make a material change to this policy, we&rsquo;ll update the date at the top of this page.</p>

        <h2>Contact us</h2>
        <p>
          PortPass Bahamas Technologies<br />
          Nassau, The Bahamas<br />
          Email: <a href="mailto:portpassbahamas@outlook.com">portpassbahamas@outlook.com</a><br />
          Phone: <a href="tel:+12424241262">+1 (242) 424-1262</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
