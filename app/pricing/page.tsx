// @public-route: how PortPass is priced.
//
// 19 Nov 2026 (Antonio): no list prices. "It should depend on the business
// or company we are helping", so the price is set per business after the
// free first look, and no figure appears here until Business Ops' pricing
// framework is approved. The steps use Business Ops' words: diagnose, fix,
// run. The plan tables (pricing_plans, the Prices screen, BillingScope,
// CompareTable) are untouched and still drive invoicing; this page just
// no longer lists them.
import type { Metadata } from "next";
import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { PageTransition } from "@/app/_components/motion/PageTransition";
import { portpassWhatsAppUrl } from "@/lib/contact";
import { Ticket } from "@/app/_components/ticket/Ticket";
import { jsonLdString } from "@/lib/seo/jsonLd";

const SITE_URL = "https://portpassbahamas.com";
const TITLE = "PortPass pricing — priced for your business, the first look is free";
const SUB = "Every business is different, so we set the price after the first look, once we know what needs fixing. The first look is free. Prices are in Bahamian dollars.";
const WHATSAPP_HREF = portpassWhatsAppUrl("Hi PortPass, I'd like a free first look at my business");
const APPLY_HREF = "/apply?utm_source=pricing";

export const metadata: Metadata = {
  title: TITLE,
  description: SUB,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: SUB, url: `${SITE_URL}/pricing` },
  twitter: { card: "summary_large_image", title: TITLE, description: SUB },
};

const STEPS: { step: string; name: string; price: string; text: string }[] = [
  { step: "Diagnose", name: "We look", price: "Free", text: "We sit with you, find where your time, money and customers leak, and why earlier fixes didn't stick. You get a short written plan. No charge, and nothing to sign." },
  { step: "Fix", name: "We fix", price: "Quoted", text: "If you want us to fix it, we quote the set-up for your business before we start: PortPass set up for you, your website and marketing where you need them, and your staff shown how to use it." },
  { step: "Run", name: "We run it with you", price: "Monthly", text: "We keep it running and send you an update every week, on a monthly retainer or a share of revenue. We agree which, and the amount, before we start." },
];

const FAQS: { q: string; a: string }[] = [
  { q: "Why is there no price list?", a: "Because a gym, a salon and a summer camp need different things. We'd rather look first and quote you a price that fits your business than sell you a plan you don't need." },
  { q: "Is the first look really free?", a: "Yes. We sit with you, look at how the business runs and give you a short written plan. You owe nothing, and you can keep the plan whether or not you work with us." },
  { q: "Do you take a cut of my payments?", a: "No. Your customers pay you directly. If we agree a share of revenue for running things, we invoice it to you separately. We never take it out of your customers' payments, and PortPass never holds your money." },
  { q: "Can customers pay by card?", a: "Card payments are not available yet. Cash and bank transfer work today, paid straight to you." },
  // VAT wording waits for the accountant's confirmation; this is the placeholder the brief asks for.
  { q: "Is VAT included?", a: "Prices are in BSD." },
];

export default function PricingPage() {
  return (
    <PageTransition>
    <main className={`home-theme pricing-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Pricing", href: "/pricing" }]} tide />

      <section className="pricing-hero">
        <span className="home-eyebrow">Pricing</span>
        <h1>Priced for your business. <strong>First look free.</strong></h1>
        <p>{SUB}</p>
      </section>

      {/* The three steps as stamped tickets (Site Design's First Look pages,
          24 Nov). The words are unchanged; the stamp is each step's price
          status, never a price. */}
      <section className="pricing-cards pricing-tickets" aria-label="Diagnose, fix, run">
        {STEPS.map((s, i) => (
          <article key={s.step}>
            <h2 className="sr-only">{`Step ${i + 1}, ${s.step}: ${s.name}, ${s.price}`}</h2>
            <Ticket top={`Step ${i + 1}`} topRight={s.step} title={s.name} line={s.text} stubLabel="Step" stubValue={String(i + 1).padStart(2, "0")} stubFoot={s.price} stamp={s.price} stampTone={i === 0 ? "signal" : "ink"} stripe={i === 0 ? "signal" : "ink"}>
              {i === 0 && <Link className="home-button pricing-ticket-cta" href={APPLY_HREF} data-still="">Book a free First Look</Link>}
            </Ticket>
          </article>
        ))}
      </section>

      <section className="pricing-who" aria-labelledby="who-h">
        <div className="pricing-who-inner">
          <h2 id="who-h">Who pays what</h2>
          <ul>
            <li>Customers browse and book for free.</li>
            <li><strong>Your customers pay you directly</strong>: cash and bank transfer work today. Card payments are not available yet. PortPass never holds your money.</li>
            <li>We invoice you for our work, separately. We never take our fee out of your customers&rsquo; payments.</li>
          </ul>
        </div>
      </section>

      <section className="pricing-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions</h2>
        {FAQS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQS.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
            }),
          }}
        />
      </section>

      <section className="home-business pricing-cta">
        <div>
          <span className="home-eyebrow">Start with a look</span>
          <h2>Tell us what&rsquo;s been stuck.</h2>
          <p>Send the basics on WhatsApp or through the form. One of us replies and books your free first look.</p>
        </div>
        <div className="biz-actions">
          <Link className="home-button" href={APPLY_HREF}>Book a free first look</Link>
          <a className="home-button home-button-light" href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
        </div>
      </section>

      <SiteFooter tide />
    </main>
    </PageTransition>
  );
}
