import Link from "next/link";
import { Suspense } from "react";
import { ApplicationForm } from "./ApplicationForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { cheapestSubscription, getPlan, listPlans } from "@/db/pricing";
import { getSectionOptions } from "@/lib/navSections";
import { dollars, percentFromBps, type PricingPlan } from "@/lib/pricingFormat";

const APPLY_TITLE = "Get listed on PortPass | PortPass Bahamas";
const APPLY_DESCRIPTION = "Send us the basics and we'll message you on WhatsApp to build your page: your prices, photos and a booking button, in one link.";

// ISR: the header now shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

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

// Every price on this page comes from pricing_plans (pricing brief, 28
// Sept). Without a database the page still renders, just without numbers.
async function loadPricing(): Promise<{ plans: PricingPlan[]; cheapest: PricingPlan | null; marketplace: PricingPlan | null }> {
  try {
    const [plans, cheapest, marketplace] = await Promise.all([listPlans({ publicOnly: true }), cheapestSubscription(), getPlan("marketplace")]);
    return { plans, cheapest, marketplace: marketplace?.isPublic ? marketplace : null };
  } catch {
    return { plans: [], cheapest: null, marketplace: null };
  }
}

export default async function ApplyPage() {
  const [sections, pricing] = await Promise.all([getSectionOptions(), loadPricing()]);
  const fromLine = pricing.cheapest ? `Then from ${dollars(pricing.cheapest.monthlyCents)}/month` : "Then a monthly plan";
  const marketplaceLine = pricing.marketplace ? `, or no monthly fee on Marketplace (${percentFromBps(pricing.marketplace.commissionBps)} of the bookings we bring you)` : "";
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Get listed", href: "/apply" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Get listed</div>
        <h1>Tell us about your business.</h1>
        <p>Six quick answers. We&rsquo;ll message you on WhatsApp within a business day, build your page from the photos and prices you send us, and give you one link to share.</p>
        <p className="apply-pricing-note">First 30 days free. {fromLine}{marketplaceLine}. <Link href="/pricing">See full pricing →</Link></p>
        <p className="auth-alt">Already on PortPass? <Link href="/login?next=%2Fbusiness%2Fsetup">Sign in to manage your listing.</Link></p>
      </section>
      {/* useSearchParams (for the UTM tags and ?plan=) needs a Suspense boundary on a statically rendered page. */}
      <Suspense fallback={null}>
        <ApplicationForm sections={sections} plans={pricing.plans.map((p) => ({ code: p.code, name: p.name }))} />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
