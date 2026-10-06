// @public-route: the public price list.
import type { Metadata } from "next";
import Link from "next/link";
import { BillingToggle } from "./BillingScope";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { PageTransition } from "@/app/_components/motion/PageTransition";
import { cheapestSubscription, listAddons, listPlans } from "@/db/pricing";
import { portpassWhatsAppUrl } from "@/lib/contact";
import { addedFeatures, annualCents, dollars, percentFromBps, UNIT_LABEL, type PricingAddon, type PricingPlan } from "@/lib/pricingFormat";
import { CompareTable } from "./CompareTable";
import { jsonLdString } from "@/lib/seo/jsonLd";

const SITE_URL = "https://portpassbahamas.com";
const SUB = "Your page, bookings and payment records in one place. We build it for you. Prices in Bahamian dollars.";
const WHATSAPP_HREF = portpassWhatsAppUrl("Hi PortPass, I'd like to get my business listed");

// Every number on this page comes from pricing_plans / pricing_addons
// (pricing brief, 28 Sept). The admin's Prices screen changes them live;
// nothing is hard-coded here.
async function loadPricing(): Promise<{ plans: PricingPlan[]; addons: PricingAddon[]; promoteLive: boolean; cheapest: PricingPlan | null }> {
  try {
    const [plans, publicAddons, cheapest] = await Promise.all([listPlans({ publicOnly: true }), listAddons({ publicOnly: true }), cheapestSubscription()]);
    return { plans, addons: publicAddons.filter((a) => a.group === "addon"), promoteLive: publicAddons.some((a) => a.group === "promote"), cheapest };
  } catch {
    return { plans: [], addons: [], promoteLive: false, cheapest: null };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const cheapest = await cheapestSubscription().catch(() => null);
  const title = cheapest ? `PortPass pricing — plans from ${dollars(cheapest.monthlyCents)}/month, 30 days free` : "PortPass pricing — simple prices, 30 days free";
  return {
    title,
    description: SUB,
    alternates: { canonical: `${SITE_URL}/pricing` },
    openGraph: { type: "website", siteName: "PortPass Bahamas", title, description: SUB, url: `${SITE_URL}/pricing` },
    twitter: { card: "summary_large_image", title, description: SUB },
  };
}

function faqItems(plans: PricingPlan[]): { q: string; a: string }[] {
  const subscriptions = plans.filter((p) => p.kind === "subscription").map((p) => p.name);
  const flat = subscriptions.length > 1 ? `${subscriptions.slice(0, -1).join(", ")} and ${subscriptions[subscriptions.length - 1]}` : subscriptions[0] ?? "a monthly plan";
  const marketplace = plans.find((p) => p.kind === "commission");
  const cut = marketplace ? `On ${marketplace.name} we invoice ${percentFromBps(marketplace.commissionBps)} of bookings PortPass brought you, once a month. ` : "";
  return [
    { q: "What happens after 30 days?", a: "We'll message you a week before. If you stay, your first invoice comes the day after the free period, then monthly. No card needed to start." },
    { q: "Can I cancel?", a: "Yes, any time before the end of a month. Annual plans run to the end of the prepaid year. You can always download your records." },
    { q: "Do you take a cut of my payments?", a: `No. On ${flat} you pay a flat monthly price. ${cut}We never deduct it from your customers' payments.` },
    { q: "Do I need to set it up myself?", a: "No. Send us your prices and photos on WhatsApp and we'll build your page." },
    { q: "Can customers pay by card?", a: "Coming soon, through a licensed payment partner. We'll publish the card fees here before it launches. Cash and bank transfer are tracked today." },
    // VAT wording waits for the accountant's confirmation; this is the placeholder the brief asks for.
    { q: "Is VAT included?", a: "Prices are in BSD." },
  ];
}

// Cached (speed brief, 29 Sept): the page renders both the monthly and the
// annual prices and BillingToggle (a small client component reading ?billing=)
// marks which shows, so no request waits for the server. Price edits revalidate it.
export const revalidate = 300;

export default async function PricingPage() {
  const pricing = await loadPricing();
  const { plans, addons, promoteLive } = pricing;
  const subscriptions = plans.filter((p) => p.kind === "subscription");
  const faqs = faqItems(plans);

  // Comparison rows: every feature any public plan lists, in the order it
  // first appears (plans are cumulative, so this is Solo's list, then what
  // Growing adds, and so on). Nothing invented.
  const featureRows: string[] = [];
  for (const plan of plans) for (const f of plan.features) if (!featureRows.includes(f)) featureRows.push(f);

  return (
    <PageTransition>
    <main className={`home-theme pricing-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Pricing", href: "/pricing" }]} tide />

      <section className="pricing-hero">
        <span className="home-eyebrow">Pricing</span>
        <h1>Simple prices. <strong>30 days free.</strong></h1>
        <p>{SUB}</p>
        <BillingToggle />
      </section>

      {plans.length === 0 ? (
        <p className="pricing-fine">Our price list is loading slowly right now. <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a> and we&rsquo;ll send it over.</p>
      ) : (
        <div className="pricing-scope" data-billing="monthly">
        <section className="pricing-cards" aria-label="Plans">
          {plans.map((plan) => {
            const previous = plan.kind === "subscription" ? subscriptions[subscriptions.indexOf(plan) - 1] ?? null : null;
            const features = addedFeatures(plan, previous);
            const isCommission = plan.kind === "commission";
            return (
              <article className={`pricing-card${plan.badge ? " pricing-card-featured" : ""}`} key={plan.code}>
                {plan.badge && <span className="pricing-badge">{plan.badge}</span>}
                <h2>{plan.name}</h2>
                <p className="pricing-card-blurb">{isCommission ? `${dollars(plan.monthlyCents)}/month · ${percentFromBps(plan.commissionBps)} of bookings we bring you.` : plan.blurb}</p>
                <div className="pricing-price when-monthly">
                  <strong>{dollars(plan.monthlyCents)}</strong>
                  <span>/month</span>
                </div>
                {!isCommission && (
                  <div className="pricing-price when-annual">
                    <strong>{dollars(annualCents(plan))}</strong>
                    <span>/year</span>
                  </div>
                )}
                {isCommission && <div className="pricing-price when-annual"><strong>{dollars(plan.monthlyCents)}</strong><span>/month</span></div>}
                <p className="pricing-price-note">{isCommission ? plan.blurb : <><span className="when-monthly">First 30 days free</span><span className="when-annual">2 months free · Setup waived</span></>}</p>
                <Link className="home-button" href={`/apply?plan=${encodeURIComponent(plan.code)}&utm_source=pricing`} data-still="">Start free</Link>
                {previous && <p className="pricing-features-lead">Everything in {previous.name}, plus</p>}
                <ul className="pricing-features">
                  {features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </article>
            );
          })}
        </section>
        </div>
      )}

      {(addons.length > 0 || !promoteLive) && (
        <section className="pricing-addons" aria-labelledby="addons-h">
          <h2 id="addons-h">Add-ons</h2>
          {addons.length > 0 && (
            <div className="pricing-addon-row">
              {addons.map((addon) => (
                <div className="pricing-addon" key={addon.code}>
                  <h3>{addon.name}</h3>
                  <strong>{dollars(addon.amountCents)}</strong> <span>{UNIT_LABEL[addon.unit]}</span>
                  {addon.note && <p>{addon.note}</p>}
                </div>
              ))}
            </div>
          )}
          {!promoteLive && <p className="pricing-promote-soon">Featured placements: coming soon.</p>}
        </section>
      )}

      <section className="pricing-who" aria-labelledby="who-h">
        <div className="pricing-who-inner">
          <h2 id="who-h">Who pays what</h2>
          <ul>
            <li>Customers browse and book for free.</li>
            <li><strong>Your customers pay you directly</strong>: cash, bank transfer, and card once our licensed partner is live. PortPass never holds your money.</li>
            <li>We send you one invoice a month for your plan. We never take our fee out of your customers&rsquo; payments.</li>
          </ul>
        </div>
      </section>

      {plans.length > 0 && featureRows.length > 0 && (
        <CompareTable title="Compare plans">
          <table className="pricing-table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                {plans.map((plan) => (
                  <th scope="col" key={plan.code}>{plan.name}<small>{plan.kind === "commission" ? `${percentFromBps(plan.commissionBps)} of bookings` : `${dollars(plan.monthlyCents)}/month`}</small></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureRows.map((feature) => (
                <tr key={feature}>
                  <th scope="row">{feature}</th>
                  {plans.map((plan) => {
                    const has = plan.features.includes(feature);
                    return <td key={plan.code} className={has ? "is-yes" : "is-no"}><span aria-label={has ? "Included" : "Not included"}>{has ? "✓" : "—"}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>
      )}

      <section className="pricing-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions</h2>
        {faqs.map((item) => (
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
              mainEntity: faqs.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
            }),
          }}
        />
      </section>

      <section className="home-business pricing-cta">
        <div>
          <span className="home-eyebrow">Ready when you are</span>
          <h2>Want us to build your page this week?</h2>
          <p>Send the basics on WhatsApp or tell us about your business. One of us replies, and one of us builds it.</p>
        </div>
        <div className="biz-actions">
          <Link className="home-button" href="/apply">Get listed</Link>
          <a className="home-button home-button-light" href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
        </div>
      </section>

      <SiteFooter tide />
    </main>
    </PageTransition>
  );
}
