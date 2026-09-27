import { Suspense } from "react";
import { ApplicationForm } from "./ApplicationForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

const APPLY_TITLE = "Get listed on PortPass | PortPass Bahamas";
const APPLY_DESCRIPTION = "Send us the basics and we'll message you on WhatsApp to build your page: your prices, photos and a booking button, in one link.";

export const metadata = {
  title: APPLY_TITLE,
  description: APPLY_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "PortPass Bahamas",
    title: APPLY_TITLE,
    description: APPLY_DESCRIPTION,
    url: "https://portpassbahamas.com/apply",
  },
  twitter: {
    card: "summary_large_image",
    title: APPLY_TITLE,
    description: APPLY_DESCRIPTION,
  },
};

export default function ApplyPage() {
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Get listed", href: "/apply" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Get listed</div>
        <h1>Tell us about your business.</h1>
        <p>Six quick answers. We&rsquo;ll message you on WhatsApp within a business day, build your page from the photos and prices you send us, and give you one link to share.</p>
        <p className="apply-pricing-note">First 30 days free. Then from $65/month, or no monthly fee on Marketplace (8% of the bookings we bring you).</p>
      </section>
      {/* useSearchParams (for the UTM tags) needs a Suspense boundary on a statically rendered page. */}
      <Suspense fallback={null}>
        <ApplicationForm />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
