import Link from "next/link";
import { Suspense } from "react";
import { bwsSerif, bwsSans } from "../fonts";
import { WeddingPlanner } from "./WeddingPlanner";
import { getPublicWeddingPackages, type PublicWeddingPackage } from "@/db/weddingPackages";
import { getPublicUnavailableDates } from "@/db/weddingAvailability";
import { withOneRetry } from "@/db/supabase";

// The planner is the actual booking conversion path -- of every page this
// pattern applies to (25 Sept brief, Part 1a/1b), this is the one where a
// crash costs a real enquiry, not just a decorated page. Both queries are
// non-essential to the wizard actually working: a couple can still pick a
// ceremony type, a date, services and submit via WhatsApp with no package
// preselected or no dates blocked, so a failure here degrades instead of
// crashing.
async function safePackages(): Promise<PublicWeddingPackage[]> {
  try {
    return await withOneRetry(() => getPublicWeddingPackages());
  } catch (error) {
    console.error("planner: packages fetch failed, showing the wizard with no package options", error);
    return [];
  }
}

async function safeUnavailableDates(): Promise<string[]> {
  try {
    return await withOneRetry(() => getPublicUnavailableDates());
  } catch (error) {
    console.error("planner: unavailable-dates fetch failed, showing the wizard with no dates blocked", error);
    return [];
  }
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan Your Bahamas Wedding | Bahamas Weddings By The Sea",
  description: "Plan a Bahamas wedding with the Wedding Desk. Explore venue preferences, choose services, request a consultation, and prepare a complete plan for Antonio Beckford to review.",
};

// Moved here from app/weddings/bahamas-by-the-sea/plan (redirected in
// next.config.ts) as part of consolidating onto this page -- the wizard
// itself (WeddingPlanner.tsx) is unchanged, still using its own bws-theme
// styling for now rather than the shared template look. Restyling it to
// match the template system (per the "do not drift" brief) is separate,
// lower-priority work from just getting a working planner at the right
// path.
export default async function PlanPage() {
  const [packages, unavailableDates] = await Promise.all([safePackages(), safeUnavailableDates()]);
  return (
    <div className={`bws-theme bws-planner-body ${bwsSerif.variable} ${bwsSans.variable}`}>
      <a className="bws-skip-link" href="#planner-main">Skip to planner</a>
      <header className="bws-site-header bws-inner-header">
        <Link className="bws-brand" href="/weddings/bahamas-weddings-by-the-sea" aria-label="Bahamas Weddings By The Sea home"><span>Bahamas</span><small>WEDDINGS BY THE SEA</small></Link>
        <nav className="bws-desktop-nav" aria-label="Main navigation">
          <Link className="bws-planner-home" href="/weddings/bahamas-weddings-by-the-sea">Back to the main site <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      <main className="bws-planner-main" id="planner-main">
        <section className="bws-planner-intro">
          <p className="bws-eyebrow">Plan from anywhere</p>
          <h1>Let&rsquo;s shape your<br /><em>island wedding.</em></h1>
          <p>Tell the Wedding Desk what you&rsquo;re imagining. A representative will help refine the details, then send one organized plan to Antonio for review.</p>
          <div className="bws-planner-trust">
            <span>Pre-consultation planning</span>
            <span>26+ years&rsquo; ceremony experience</span>
            <span>Nassau, The Bahamas</span>
          </div>
        </section>
        <Suspense fallback={null}>
          <WeddingPlanner packages={packages} unavailableDates={unavailableDates} />
        </Suspense>
      </main>
      <footer className="bws-planner-footer">
        <span>Bahamas Weddings By The Sea · Planning desk managed by the Wedding Desk</span>
        <a href="tel:+12424241262">Call +1 (242) 424-1262</a>
        <Link href="/weddings/bahamas-weddings-by-the-sea">Return to main site</Link>
        <span>Booking and planning desk powered by <a href="https://portpassbahamas.com">PortPass Bahamas</a>.</span>
      </footer>
    </div>
  );
}
