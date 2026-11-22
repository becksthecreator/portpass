import Link from "next/link";
import { Suspense } from "react";
import { ApplicationForm } from "./ApplicationForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { listPlans } from "@/db/pricing";
import { getSectionOptions } from "@/lib/navSections";
import type { PricingPlan } from "@/lib/pricingFormat";

const APPLY_TITLE = "Book a free first look | PortPass Bahamas";
const APPLY_DESCRIPTION = "Six quick answers about your business. We'll message you on WhatsApp within a business day to book your free first look.";

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

// Plan names only, for a ?plan= link the form shows back; no price is
// shown here (Antonio, 19 Nov). Without a database the form still works.
async function loadPricing(): Promise<{ plans: PricingPlan[] }> {
  try {
    return { plans: await listPlans({ publicOnly: true }) };
  } catch {
    return { plans: [] };
  }
}

export default async function ApplyPage() {
  const [sections, pricing] = await Promise.all([getSectionOptions(), loadPricing()]);
  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Get listed", href: "/apply" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Get listed</div>
        <h1>Tell us about your business.</h1>
        <p>Six quick answers. We&rsquo;ll message you on WhatsApp within a business day to book your free first look.</p>
        {/* No list prices (Antonio, 19 Nov): each business is quoted after the first look. */}
        <p className="apply-pricing-note">The first look is free. After it, we quote a price that fits your business. <Link href="/pricing">How pricing works →</Link></p>
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
