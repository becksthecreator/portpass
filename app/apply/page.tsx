import Link from "next/link";
import { Suspense } from "react";
import { ApplicationForm } from "./ApplicationForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { listPlans } from "@/db/pricing";
import type { PricingPlan } from "@/lib/pricingFormat";
import { Scorecard, Ticket, type ScoreRow } from "@/app/_components/ticket/Ticket";
import { portpassWhatsAppUrl } from "@/lib/contact";
import "./first-look.css";

// /apply is the First Look page (Site Design's mockup, Bex's OK, 24 Nov):
// where the "Your free First Look" ads land, so it looks and talks like
// them. The form, its fields and its POST are unchanged.
const APPLY_TITLE = "Your free First Look | PortPass Bahamas";
const APPLY_DESCRIPTION = "We look at your business the way a new customer does. Then we show you what we found.";

// An example: the six rows a First Look scores (the same six as the
// outreach pack's call scorecard, Bex 25 Nov), with example marks.
const SCORE_ROWS: ScoreRow[] = [
  { name: "How customers find you", detail: "Google, Instagram, word of mouth", mark: "Strong", tone: "strong" },
  { name: "How they book", detail: "Calls, DMs, walk-ins, paper book", mark: "Fix", tone: "signal" },
  { name: "How fast you reply", detail: "The messages that go unanswered", mark: "Fix", tone: "signal" },
  { name: "How they pay", detail: "Deposits, no-shows, who still owes", mark: "OK", tone: "ok" },
  { name: "What brings them back", detail: "Reminders, reviews, regulars", mark: "OK", tone: "ok" },
  { name: "Your time", detail: "Hours a week on messages and admin", mark: "Fix", tone: "signal" },
];

function DmFirstLook({ className }: { className: string }) {
  return (
    <p className={`fl-dm ${className}`}>
      <b>DM FIRST LOOK</b>
      <span>Rather message? Send the two words to PortPass on Instagram, or <a href={portpassWhatsAppUrl("Hi PortPass, I'd like a free First Look.")} target="_blank" rel="noopener noreferrer">WhatsApp us</a>. We reply and set a time.</span>
    </p>
  );
}

// ISR: the header now shows live counts from the database, so a static page
// regenerates every five minutes rather than only at deploy time.
export const revalidate = 300;

export const metadata = {
  title: APPLY_TITLE,
  description: APPLY_DESCRIPTION,
  alternates: { canonical: "/apply" },
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
// shown here (Bex, 23 Nov). Without a database the form still works.
async function loadPricing(): Promise<{ plans: PricingPlan[] }> {
  try {
    return { plans: await listPlans({ publicOnly: true }) };
  } catch {
    return { plans: [] };
  }
}

export default async function ApplyPage() {
  const pricing = await loadPricing();
  return (
    <main className="form-page fl-page">
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "First Look", href: "/apply" }]} />
      <div className="fl">
        <div className="fl-left">
          <div className="fl-words">
            <p className="fl-kicker">For Nassau businesses</p>
            <h1>Your free <br />First <span>Look.</span></h1>
            <p className="fl-sub">We look at your business the way a new customer does. Then we show you what we found.</p>
          </div>
          <Ticket top="First Look" topRight="No cost" title="About 30 minutes" line="At your business or on a call · One-page scorecard after" stubLabel="Pass" stubValue="FREE" stubFoot="No obligation" stamp="Free" />
          <a className="home-button fl-phone-only" href="#book">Book my free First Look</a>
          <DmFirstLook className="fl-phone-only" />
          <Scorecard rows={SCORE_ROWS} foot="Example scorecard. Yours is about your business, plus the two or three fixes we'd make first." />
          {/* No list prices (Bex, 23 Nov): each business is quoted after the first look. */}
          <p className="fl-note">After it, we quote a price that fits your business. <Link href="/pricing">How pricing works →</Link></p>
        </div>
        <div className="fl-form" id="book">
          <h2>Book your First Look</h2>
          {/* useSearchParams (for the UTM tags and ?plan=) needs a Suspense boundary on a statically rendered page. */}
          <Suspense fallback={null}>
            <ApplicationForm plans={pricing.plans.map((p) => ({ code: p.code, name: p.name }))} />
          </Suspense>
          <DmFirstLook className="fl-desk-only" />
          <p className="auth-alt">Already on PortPass? <Link href="/login?next=%2Fbusiness%2Fsetup">Sign in to manage your listing.</Link></p>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
