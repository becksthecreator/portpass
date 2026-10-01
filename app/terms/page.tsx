import Link from "next/link";
import { AttorneyReviewNote, LegalChangelog, LegalVersionLine } from "@/app/_components/LegalParts";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";
import { TERMS_OF_SERVICE } from "@/lib/legal";

// ISR: the header shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

export const metadata = {
  title: "Terms of Service | PortPass Bahamas",
  description: "The terms for using PortPass Bahamas: accounts, registering and booking, paying a business, and listing your business.",
};

// Terms of Service v2 (brief 16 D, brief 07). Describes the product as it
// works today: no card payments, no PortPass review system, businesses paid
// directly. Prices, plan rules and tax are deliberately not restated here:
// they live on /pricing and in each business's agreement. The version, date
// and changelog live in lib/legal.ts.
export default function TermsPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Terms", href: "/terms" }]} />
      <section className="form-intro">
        <LegalVersionLine doc={TERMS_OF_SERVICE} />
        <h1>Terms of Service.</h1>
        <p>
          These terms cover your use of portpassbahamas.com and PortPass accounts, run by PortPass Bahamas Technologies (“PortPass”, “we”, “us”). By using the site, creating an account, registering, booking or listing a business, you agree to them.
        </p>
      </section>
      <article className="legal-body">
        <AttorneyReviewNote />

        <h2>What PortPass is</h2>
        <p>
          PortPass is where people in The Bahamas find and book local businesses: sports programmes, wedding services and more. Each business listed here is a separate business. It sets its own prices, runs its own sessions and events, and is responsible for the service it gives you. PortPass provides the page, the forms and the record-keeping.
        </p>
        <p>
          PortPass’s founders also work with some of the businesses listed here. Those businesses are still separate from PortPass and answer for their own services.
        </p>
        <p>
          We review a business before we list it. We do not verify its licences, insurance or qualifications, and a listing is not a recommendation or a guarantee.
        </p>

        <h2>Your PortPass account</h2>
        <p>
          You don’t need an account to browse, enquire or register. If you create one:
        </p>
        <ul>
          <li>You must be 18 or older.</li>
          <li>Give your real name and an email address you control. Each email address has one account.</li>
          <li>You sign in with a code sent to your email, or with Google. Keep your email account secure: anyone who can read your email can sign in as you.</li>
          <li>Tell us straight away if you think someone else has used your account.</li>
        </ul>
        <p>
          You can ask us to close your account at any time. We may suspend or close an account that is used to break these terms.
        </p>

        <h2>Registering, booking and enquiring</h2>
        <p>
          What happens when you send a form depends on the form, and the page tells you which it is:
        </p>
        <ul>
          <li><strong>A registration for a class or camp</strong> holds your place as soon as you send it, with payment still to come. The business then confirms it. If the fee is not paid as agreed, the business may cancel the place.</li>
          <li><strong>A waitlist entry</strong> does not hold a place. There is nothing to pay unless the business offers you one.</li>
          <li><strong>A free taster</strong> needs a PortPass account, is limited to one per child, and is booked when you send the form.</li>
          <li><strong>A request for a private session or a party</strong> is not confirmed until a coach accepts it.</li>
          <li><strong>An enquiry</strong>, such as a wedding enquiry, starts a conversation. Nothing is booked until the business confirms it with you.</li>
        </ul>
        <p>
          Give accurate information, and tell the business if it changes.
        </p>

        <h2>Children’s programmes</h2>
        <p>
          Only a parent, a legal guardian, or an adult they have authorised may register a child. When you register a child you confirm that you are that person, that the information is accurate and complete, and that you will tell the business if the child’s health details or emergency contact change.
        </p>
        <p>
          The consent and waiver you sign on the registration form is between you and the business running the programme. The business, not PortPass, supervises the children, decides who may collect a child, and is responsible for their safety during its sessions.
        </p>
        <p>
          How a child’s information is used, who can see it and when it is deleted is set out in the <Link href="/privacy#children">Privacy Policy</Link>.
        </p>

        <h2>Prices and payments</h2>
        <p>
          Each business sets its own prices, shown in Bahamian dollars. You pay the business directly, by cash or bank transfer, using the details the business gives you. PortPass does not take card payments and never holds your money. The business records your payment against your booking.
        </p>
        <p>
          Because PortPass does not receive your payment, we cannot refund it. Refunds come from the business.
        </p>

        <h2>Cancellations, changes and refunds</h2>
        <p>
          Each business sets its own rules on cancelling, missed sessions, bad weather and refunds. Ask the business for them before you pay. To cancel or change a booking, contact the business. If you can’t resolve a problem with a business, email us and we will help you reach it.
        </p>

        <h2>Ratings and reviews</h2>
        <p>
          PortPass does not collect reviews. A rating, review count or award on a listing comes from the business or from a third-party review site, and we do not verify it.
        </p>

        <h2>Using PortPass fairly</h2>
        <p>
          Don’t send false registrations, enquiries or requests. Don’t try to get into another person’s account or records, a staff area, or the systems behind the site. Don’t copy the site’s listings in bulk, and don’t interfere with how it runs.
        </p>

        <h2 id="business">Listing your business</h2>
        <p>
          If you list a business on PortPass, these terms apply as well as any written agreement you have with us. Where the two differ, the agreement applies.
        </p>
        <ul>
          <li><strong>Your listing.</strong> You are responsible for everything on it being true and current: what you offer, your prices, your schedule and your contact details. An offering is only shown once it has a price.</li>
          <li><strong>Review.</strong> We review a business before it goes live. We may decline a listing, send it back for changes, or hide or remove it, for example if it is misleading, breaks the law or these terms, or draws complaints. If you change your business name, your category or your bank details, we review the listing again, and it may be hidden while we do.</li>
          <li><strong>Plans and fees.</strong> Our plans, what each costs, the free period, and how and when we invoice are on the <Link href="/pricing">pricing page</Link> and in your agreement. We invoice you; we never take our fee out of your customers’ payments. You can cancel as the pricing page describes. We give you at least 30 days’ written notice before a price you already pay goes up.</li>
          <li><strong>Your customers and their payments.</strong> Your customers pay you directly. You are responsible for your own prices, receipts, refunds and cancellation rules, and for recording payments accurately.</li>
          <li><strong>Your customers’ information.</strong> You may use the information customers give you through PortPass only to provide your service to them. Keep it confidential, give access only to staff who need it, and follow the data protection law of The Bahamas and our <Link href="/privacy">Privacy Policy</Link>. This matters most for children’s health and emergency details.</li>
          <li><strong>Photos and content.</strong> Upload only photos and text you have the right to use. Before you publish a photo that shows a child, you must hold a parent’s or guardian’s consent for every child in it. You give PortPass permission to show your content on the site and in material that promotes your listing.</li>
          <li><strong>Your team.</strong> You decide who on your team can sign in and what they can do, and you are responsible for what they do there. Remove a person’s access when they leave.</li>
          <li><strong>Leaving.</strong> You can ask us to take your listing down at any time. Records you are required to keep, such as payment records, stay available to you as set out in the Privacy Policy.</li>
        </ul>

        <h2>Our responsibility to you</h2>
        <p>
          We work to keep PortPass available and accurate, but we provide it as it is, and we don’t promise it will never be interrupted or free of mistakes.
        </p>
        <p>
          PortPass is not responsible for the services a listed business provides, or for an injury, loss or dispute arising from them. That is between you and the business.
        </p>
        <p>
          Nothing in these terms limits a responsibility that the law does not allow us to limit, or takes away rights you have under consumer law. Beyond that, PortPass is not liable for losses we could not reasonably have foreseen, and our total liability to a business that lists with us is limited to the fees it paid us in the 12 months before the claim.
        </p>

        <h2>Your information</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains what we collect, who can see it and how long we keep it. It forms part of these terms.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of the Commonwealth of The Bahamas, and the courts of The Bahamas decide any dispute about them.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          When we change these terms we update the version and the date at the top and list what changed at the bottom. If you have an account or a listing, we will email you about a change that affects your rights before it takes effect.
        </p>

        <h2>Contact us</h2>
        <p>
          PortPass Bahamas Technologies<br />
          Nassau, The Bahamas<br />
          Email: <a href={`mailto:${PORTPASS_SUPPORT_EMAIL}`}>{PORTPASS_SUPPORT_EMAIL}</a><br />
          Phone: <a href={`tel:${PORTPASS_PHONE_E164}`}>{PORTPASS_PHONE_DISPLAY}</a>
        </p>

        <LegalChangelog doc={TERMS_OF_SERVICE} />
      </article>
      <SiteFooter />
    </main>
  );
}
