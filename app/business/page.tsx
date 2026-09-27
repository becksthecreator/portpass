import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { portpassWhatsAppUrl } from "@/lib/contact";
import { SECTIONS } from "@/lib/sections";

// No openGraph here on purpose: the root file-based image is inherited
// only when a page doesn't export its own openGraph object.
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

const PLANS = [
  { name: "Solo", price: "$65", featured: false },
  { name: "Growing", price: "$120", featured: true },
  { name: "Business", price: "$220", featured: false },
] as const;

export default function BusinessPage() {
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
      </section>

      <div className="biz-sections">
        {SECTIONS.map((section) => (
          <div className="biz-section" key={section.slug}>
            <h3>{section.href ? <Link href={section.href}>{section.name}</Link> : section.name}</h3>
            <p>{section.line}</p>
            {!section.href && <small>Coming soon</small>}
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
        <div className="biz-plans">
          {PLANS.map((plan) => (
            <div className={`biz-plan${plan.featured ? " biz-plan-featured" : ""}`} key={plan.name}>
              <h3>{plan.name}</h3>
              <strong>{plan.price}</strong>
              <span>per month</span>
            </div>
          ))}
          <div className="biz-plan">
            <h3>Marketplace</h3>
            <strong>$0</strong>
            <span>no monthly fee</span>
            <p>8% of the bookings we bring you.</p>
          </div>
        </div>
        <div className="biz-pricing-notes">
          <span>Every plan starts with 30 days free — we&rsquo;ll confirm which one fits on your first call.</span>
          <span>Card payments: coming soon with a licensed partner. Cash and bank transfer work today.</span>
        </div>
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
