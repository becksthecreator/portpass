// @public-route: the "PortPass for business" marketing page.
import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { portpassWhatsAppUrl } from "@/lib/contact";
import { getSectionTiles } from "@/lib/navSections";
import { getBusinessProof } from "@/db/businessProof";
import { proofSentence } from "@/lib/businessProof";
import "@/app/phase1.css";

// No openGraph here on purpose: the root file-based image is inherited
// only when a page doesn't export its own openGraph object.
// ISR: the header now shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

export const metadata = {
  title: "PortPass for Business | Your bookings and payments in one place",
  description: "One link with your prices, photos and a booking button. Send us your photos and prices on WhatsApp, we build your page, you share one link.",
  alternates: { canonical: "/business" },
};

const WHATSAPP_HREF = portpassWhatsAppUrl("Hi PortPass — I run a business and want to get listed.");

const STEPS = [
  ["Send us your photos and prices on WhatsApp", "A few photos, what you offer and what it costs. That's the whole form."],
  ["We build your page", "Your listing goes up on PortPass with a booking button, built from what you sent."],
  ["Share one link", "In your bio, your status and your replies. Bookings and payments land in one place."],
] as const;

// The product, as three real screens (brief 18, A7). Until the demo
// business exists (Part B) these are from the TEST business the
// screenshot job builds: every name on them is marked TEST.
const SHOTS = [
  { src: "/brand/product/shot-requests.png", alt: "A business's list of payment requests on PortPass, each marked sent, part paid, overdue or draft", title: "See who's paid", copy: "Every request in one list: sent, part paid, overdue. No more scrolling WhatsApp to check." },
  { src: "/brand/product/shot-pay.png", alt: "The page a customer opens from a payment request: the amount, what it is for and how to pay the business directly", title: "Send a payment request", copy: "Your customer gets one link with the amount, what it's for and how to pay you directly." },
  { src: "/brand/product/shot-paid.png", alt: "The same page once the business has marked the request paid, with a receipt", title: "Mark it paid, send the receipt", copy: "When the money reaches you, mark it paid. Your customer gets a receipt and your records stay straight." },
] as const;

// Plain answers to what a business asks first. Nothing here says card
// payments work: they don't yet.
const FAQS: Array<{ q: string; a: ReactNode }> = [
  { q: "How do customers pay me?", a: <>Straight to you: cash, bank transfer or a Kanoo wallet transfer. PortPass never holds your money. You send a payment request, the customer pays you the way you choose, and you mark it paid. Card payments are not available yet.</> },
  { q: "Do I need a website?", a: <>No. Your PortPass page is one link with your prices, your photos and a booking button. If you already have a website, link to your page from it.</> },
  { q: "What does it cost?", a: <>The first look is free. After it, we quote a price that fits your business. How it works is on the <Link href="/pricing">pricing page</Link>.</> },
  { q: "Who builds my page?", a: <>We do. Send us your photos and prices on WhatsApp and one of us builds it, then shows it to you before it goes live.</> },
  { q: "Can I leave?", a: <>Yes. The notice is set in your agreement before we start, and you can always download your records.</> },
];

export default async function BusinessPage() {
  // No list prices (Bex, 23 Nov: "hide the old prices"): each business is
  // quoted after the free first look, as on /pricing. The proof line is counted from the database on each build of the page;
  // if it can't be read, the page simply doesn't show one.
  const [sections, proof] = await Promise.all([getSectionTiles(), getBusinessProof().catch(() => null)]);
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
        <p className="auth-alt">Want to see it first? <Link href="/demo">Try a demo business →</Link></p>
        <p className="auth-alt">Already on PortPass? <Link href="/login?next=%2Fbusiness%2Fsetup">Sign in to manage your listing.</Link></p>
      </section>

      {proof && <p className="biz-proof">{proofSentence(proof)}<small>Counted from PortPass just now.</small></p>}

      <div className="biz-sections">
        {sections.map((section) => (
          <div className="biz-section" key={section.slug}>
            <h2><Link href={section.href}>{section.name}</Link></h2>
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

      <section className="biz-shots" id="product" aria-labelledby="biz-shots-title">
        <div className="home-section-heading">
          <span className="home-eyebrow">What you get</span>
          <h2 id="biz-shots-title">Know who&rsquo;s paid, without the chase.</h2>
        </div>
        <div className="biz-shots-grid">
          {SHOTS.map((shot) => (
            <figure className="biz-shot" key={shot.src}>
              <div className="biz-shot-frame"><Image src={shot.src} alt={shot.alt} fill sizes="(max-width: 760px) 340px, 320px" /></div>
              <figcaption><b>{shot.title}</b><span>{shot.copy}</span></figcaption>
            </figure>
          ))}
        </div>
        <p className="biz-shots-note">Screens from the demo business. Every name on them is made up. <Link href="/demo">Try it yourself →</Link></p>
      </section>

      <section className="biz-pricing" id="pricing">
        <div className="home-section-heading">
          <span className="home-eyebrow">Pricing</span>
          <h2>Priced for your business.</h2>
        </div>
        <div className="biz-pricing-notes">
          <span>The first look is free. After it, we quote a price that fits your business.</span>
          <span>Cash, bank transfer and Kanoo wallet transfers work today, paid straight to you. Card payments are not available yet.</span>
        </div>
        <p className="biz-pricing-more"><Link href="/pricing">How pricing works →</Link></p>
      </section>

      <section className="biz-faq" id="questions" aria-labelledby="biz-faq-title">
        <div className="home-section-heading">
          <span className="home-eyebrow">Questions</span>
          <h2 id="biz-faq-title">What businesses ask us first.</h2>
        </div>
        {FAQS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
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
