import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";

export const metadata = {
  title: "Privacy Policy | PortPass Bahamas",
  description: "How PortPass Bahamas Technologies collects, uses, and protects your information — including PortPass accounts.",
};

// Version 2: written for the arrival of PortPass accounts (sign-in codes,
// business members, audit log) and to correct the analytics statement --
// no analytics runs on the site today.
export default function PrivacyPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Privacy", href: "/privacy" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Effective 27 September 2026 &middot; version 2</div>
        <h1>Privacy Policy.</h1>
        <p>PortPass Bahamas Technologies (&ldquo;PortPass,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) operates portpassbahamas.com, the booking pages of the businesses listed on it, and PortPass accounts. This policy explains what we collect, why, who can see it, and what you can ask us to do with it.</p>
      </section>
      <article className="legal-body">
        <h2>What we collect, and when</h2>
        <p><strong>When you book or enquire without an account.</strong> Registering a child, sending a wedding enquiry, or asking to be told when a section opens: we collect what you give us directly &mdash; your name, email address, phone number, and the details the booking needs (preferred dates, guest counts, ceremony or program preferences, and similar). You never need an account to do this.</p>
        <p><strong>When you create a PortPass account.</strong> Your name, your email address, and optionally your phone number. Signing in works by a 6-digit code we email you; there are no passwords, so we store none. While you are signed in, a session cookie keeps you signed in, and a second cookie may remember which area of PortPass you chose to open last. If you booked or enquired earlier with the same email address, we link those bookings to your account so you can see them.</p>
        <p><strong>When you run a business on PortPass.</strong> Your business details (name, section, contact details, photos, prices, payment methods), the names, email addresses and roles of the people you add to your team, and any bank-transfer details you choose to publish to your customers. We keep an audit log of changes to roles, approvals and payment details &mdash; who changed what, and when &mdash; because those are the changes someone would abuse.</p>
        <p><strong>When you ask to be listed.</strong> Your name, business name, section, WhatsApp number, Instagram handle if you give one, a short note, and the campaign tags in the link you used to reach us (for example a QR code at an event), so we know which materials work.</p>
        <p><strong>Payments.</strong> We do not collect payment card numbers. Card payments are not yet available on PortPass; when they are, card details will be entered directly into a licensed payment provider&rsquo;s own secure form and will never pass through PortPass&rsquo;s systems. Cash and bank-transfer payments are recorded by the business, not by us.</p>

        <h2>Children&rsquo;s programs</h2>
        <p>Some listings on PortPass, including youth sports programs, are registered for by a parent or guardian on behalf of a child. We collect the information the registering adult provides about the child (name, date of birth, and program-relevant details, which can include allergies, medical conditions, medications, special needs, emergency contacts and who may collect the child) solely to run that program. We do not knowingly collect information directly from children.</p>
        <p>Medical and emergency details are visible only to that business&rsquo;s own staff whose role needs them &mdash; the owner and administrators, and coaches the owner has specifically allowed to see them. They are never shown in a parent&rsquo;s PortPass account, never in any public page, and never to PortPass&rsquo;s own platform staff through the business&rsquo;s pages. Parents update these details through the registration itself, and every edit is logged.</p>

        <h2>How we use it</h2>
        <p>To process your enquiry or booking, put you in touch with the business you&rsquo;re booking with, send you confirmations and updates about that booking, sign you in, show you your own bookings, let a business run its listings and team, and respond to questions you send us. We do not sell your information, and we do not use it for advertising.</p>

        <h2>Who we share it with</h2>
        <p><strong>The business you book with</strong> sees the details of your booking &mdash; that is the point of the booking. <strong>Service providers</strong> that run PortPass for us: Supabase (database and sign-in, hosted in the United States), Vercel (website hosting) and Resend (email delivery). They process data only on our instructions. <strong>WhatsApp links</strong> on PortPass open WhatsApp on your device; any message you then send goes to that business through Meta&rsquo;s service, not through PortPass, and Meta&rsquo;s own terms apply to it.</p>
        <p>Because our providers are in the United States, information you give us is stored there. We choose providers that protect it to the standards described in their own security documentation and we access it only through controlled server-side systems.</p>

        <h2>Cookies and analytics</h2>
        <p>PortPass uses only essential cookies: the sign-in session cookies described above, and a cookie that remembers the area of PortPass you chose to open. There are no advertising or tracking cookies.</p>
        <p>We do not currently run any analytics on portpassbahamas.com. If we add usage analytics in future, it will be cookieless and will not track you across other websites, and this page will say so.</p>

        <h2>How long we keep it</h2>
        <p>We keep booking, enquiry and payment records for as long as needed to provide the service and to meet the business&rsquo;s and our own accounting and legal obligations, then delete or anonymize them. Sign-in codes expire within minutes and are not kept. Audit-log entries are kept for as long as the business is on PortPass.</p>

        <h2>Deleting your account</h2>
        <p>You can delete your PortPass account from your account page, or by emailing us. Deleting your account removes your login and your profile. Records of bookings and payments already made stay with the business you made them with, as its own records, under the retention rules above &mdash; deleting an account does not un-happen a booking. If you were a member of a business&rsquo;s team, your membership ends; the business&rsquo;s own data stays with the business.</p>

        <h2>How we protect it</h2>
        <p>All access to PortPass data goes through our own servers; the website never talks to the database directly from your browser. What each signed-in person may see is worked out on our servers from their verified sign-in every time, never from anything their browser claims. Changes that matter &mdash; roles, approvals, payment details &mdash; are logged with who made them.</p>

        <h2>Your rights</h2>
        <p>You can ask us what information we hold about you, ask us to correct it, ask us to delete it, or ask us to stop using it in a particular way, by emailing us at the address below. We&rsquo;ll respond as quickly as we can, and normally within 30 days.</p>

        <h2>Changes to this policy</h2>
        <p>If we make a material change to this policy, we&rsquo;ll update the date and version at the top of this page. Version 1 was published in September 2026; version 2 adds PortPass accounts and business teams, and corrects the analytics statement.</p>

        <h2>Contact us</h2>
        <p>
          PortPass Bahamas Technologies<br />
          Nassau, The Bahamas<br />
          Email: <a href={`mailto:${PORTPASS_SUPPORT_EMAIL}`}>{PORTPASS_SUPPORT_EMAIL}</a><br />
          Phone: <a href={`tel:${PORTPASS_PHONE_E164}`}>{PORTPASS_PHONE_DISPLAY}</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
