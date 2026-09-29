// @public-route: the "PortPass for business" marketing page.
import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { listPlans } from "@/db/pricing";
import { portpassWhatsAppUrl } from "@/lib/contact";
import { getSectionTiles } from "@/lib/navSections";
import { dollars, percentFromBps } from "@/lib/pricingFormat";

// No openGraph here on purpose: the root file-based image is inherited
// only when a page doesn't export its own openGraph object.
// ISR: the header now shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

export const metadata = {
  title: "PortPass for Business | Your bookings and payments in one place",
  description: "One link with your prices, photos and a booking button. Send us your photos and prices on WhatsApp, we build your page, you share one link.",
};

const WHATSAPP_HREF = portpassWhatsAppUrl("Hi PortPass — I run a business and want to get listed.");

const STEPS = [
  ["Send us your photos and prices on WhatsApp", "A few photos, what you offer and what it costs. That's the whole form."],
  ["We build your page", "Your listing goes up on PortPass with a booking button, built from what you sent."],
  ["Share one link", "In your bio, your status and your replies. Bookings and payments land in one place."],
] as const;

export default async function BusinessPage() {
  // Prices come from pricing_plans (pricing brief, 28 Sept): nothing on
  // this page is hard-coded, and the admin's Prices screen changes it live.
  const [sections, plans] = await Promise.all([getSectionTiles(), listPlans({ publicOnly: true }).catch(() => [])]);
  const subscriptions = plans.filter((p) => p.kind === "subscription");
  const marketplace = plans.find((p) => p.kind === "commission") ?? null;
  return (
    <main className={`home-theme ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }]} />

      <section className="biz-hero">
        <span className="home-eyebrow">PortPass for business</span>
        <h1>Your bookings and payments in one place, not lost in WhatsApp.</h1>
        <p>One link with your prices, your photos and a booking button. We build it for you; you share it everywhere you already talk to customers.</p>
        <div className="biz-actions">
          <Link className="home-button" href="/apply">Get listed →</Link>
          <a className="home-button home-button-light" href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
        </div>
        <p className="auth-alt">Already on PortPass? <Link href="/login?next=%2Fbusiness%2Fsetup">Sign in to manage your listing.</Link></p>
      </section>

      <div className="biz-sections">
        {sections.map((section) => (
          <div className="biz-section" key={section.slug}>
            <h3><Link href={section.href}>{section.name}</Link></h3>
            <p>{section.line}</p>
          </div>
        ))}
      </div>

      <section className="home-how" id="how-it-works">
        <div className="home-section-heading">
          <span className="home-eyebrow">How it works</span>
          <h2>Three steps. No forms to fill.</h2>
        </div>
        <div className="biz-steps">
          {STEPS.map(([title, copy], index) => (
            <div className="biz-step" key={title}>
              <span aria-hidden="true">{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="biz-pricing" id="pricing">
        <div className="home-section-heading">
          <span className="home-eyebrow">Pricing</span>
          <h2>First 30 days free.</h2>
        </div>
        {plans.length > 0 && (
          <div className="biz-plans">
            {subscriptions.map((plan) => (
              <div className={`biz-plan${plan.badge ? " biz-plan-featured" : ""}`} key={plan.code}>
                <h3>{plan.name}</h3>
                <strong>{dollars(plan.monthlyCents)}</strong>
                <span>per month</span>
                {plan.blurb && <p>{plan.blurb}</p>}
              </div>
            ))}
            {marketplace && (
              <div className="biz-plan">
                <h3>{marketplace.name}</h3>
                <strong>{dollars(marketplace.monthlyCents)}</strong>
                <span>no monthly fee</span>
                <p>{percentFromBps(marketplace.commissionBps)} of the bookings we bring you.</p>
              </div>
            )}
          </div>
        )}
        <div className="biz-pricing-notes">
          <span>Every plan starts with 30 days free — we&rsquo;ll confirm which one fits on your first call.</span>
          <span>Card payments: coming soon with a licensed partner. Cash and bank transfer work today.</span>
        </div>
        <p className="biz-pricing-more"><Link href="/pricing">See full pricing →</Link></p>
      </section>

      <section className="biz-founders" aria-label="The founders">
        {/* Photo slot: swap this placeholder for the founders' photo once it exists. */}
        <div className="biz-founders-photo" aria-hidden="true">A &amp; A</div>
        <div>
          <span className="home-eyebrow">Who you&rsquo;re talking to</span>
          <h2>Antonio and Adon Beckford</h2>
          <p>The brothers behind PortPass, in Nassau. When you message us, it&rsquo;s one of us who replies — and one of us who builds your page.</p>
        </div>
      </section>

      <section className="home-business">
        <div>
          <span className="home-eyebrow">Ready when you are</span>
          <h2>Get your page built this week.</h2>
          <p>Send the basics on WhatsApp or tell us about your business and we&rsquo;ll take it from there.</p>
        </div>
        <div className="biz-actions">
          <Link className="home-button home-button-light" href="/apply">Get listed →</Link>
          <a className="home-button home-button-light" href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
