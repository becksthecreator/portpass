import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata = {
  title: "Terms of Service | PortPass Bahamas",
  description: "The terms that apply to booking, listing, and paying through PortPass Bahamas.",
};

export default function TermsPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Terms", href: "/terms" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Effective September 2026</div>
        <h1>Terms of Service.</h1>
        <p>These terms cover use of portpassbahamas.com, operated by PortPass Bahamas Technologies (&ldquo;PortPass,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By using this site, you agree to them.</p>
      </section>
      <article className="legal-body">
        <h2>What PortPass is</h2>
        <p>PortPass is a booking and payment platform for independent Bahamian businesses — sports programs, wedding services, and similar. The businesses listed on PortPass (such as Futprep Athletics and Bahamas Weddings By The Sea) are independent operators responsible for the service they deliver. PortPass provides the platform that connects you with them and, where enabled, processes payment on their behalf.</p>

        <h2>Enquiries and bookings</h2>
        <p>Submitting a form on PortPass is an enquiry, not a confirmed booking, unless the specific listing states otherwise at the point of payment. A date, session, or package is only reserved once the business confirms it and, where payment is required, payment has been received.</p>

        <h2>Payments</h2>
        <p>Where a listing accepts online payment, it is processed by a licensed third-party payment processor. PortPass does not store your full card details. Prices shown are set by the individual business and may be subject to additional government fees (for example, marriage licence fees) that are called out separately where they apply.</p>

        <h2>Cancellations and refunds</h2>
        <p>Cancellation and refund terms are set by the individual business you&rsquo;re booking with and will be confirmed to you before any payment is taken. If you have a dispute about a charge, contact us at the email below and we&rsquo;ll help connect you with the business to resolve it.</p>

        <h2>Acceptable use</h2>
        <p>Don&rsquo;t use PortPass to submit false booking requests, attempt to circumvent payment, or interfere with the site&rsquo;s normal operation.</p>

        <h2>Listing your business</h2>
        <p>If you apply to list your business on PortPass, you&rsquo;re responsible for the accuracy of the information you provide and for delivering the services you list. PortPass reserves the right to decline or remove a listing.</p>

        <h2>Liability</h2>
        <p>PortPass is not responsible for the quality or delivery of services provided by the independent businesses listed on the platform. To the extent permitted by law, PortPass&rsquo;s liability to you is limited to the amount of any platform fee you paid us directly.</p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of the Commonwealth of The Bahamas.</p>

        <h2>Changes to these terms</h2>
        <p>If we make a material change to these terms, we&rsquo;ll update the date at the top of this page.</p>

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
