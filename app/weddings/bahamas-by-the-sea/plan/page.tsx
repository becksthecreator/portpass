import Link from "next/link";
import { Suspense } from "react";
import { bwsSerif, bwsSans } from "../fonts";
import { WeddingPlanner } from "./WeddingPlanner";

export const metadata = {
  title: "Plan Your Bahamas Wedding | Bahamas Weddings By The Sea",
  description: "Plan a Bahamas wedding with the Beckfords Wedding Desk. Explore venue preferences, choose services, request a consultation, and prepare a complete plan for Antonio Beckford Sr. to review.",
};

export default function PlanPage() {
  return (
    <div className={`bws-theme bws-planner-body ${bwsSerif.variable} ${bwsSans.variable}`}>
      <a className="bws-skip-link" href="#planner-main">Skip to planner</a>
      <header className="bws-site-header bws-inner-header">
        <Link className="bws-brand" href="/weddings/bahamas-by-the-sea" aria-label="Bahamas Weddings By The Sea home"><span>Bahamas</span><small>WEDDINGS BY THE SEA</small></Link>
        <Link className="bws-planner-home" href="/weddings/bahamas-by-the-sea">Back to the main site <span aria-hidden="true">↗</span></Link>
      </header>
      <main className="bws-planner-main" id="planner-main">
        <section className="bws-planner-intro">
          <p className="bws-eyebrow">Plan from anywhere</p>
          <h1>Let&rsquo;s shape your<br /><em>island wedding.</em></h1>
          <p>Tell the Beckfords Wedding Desk what you&rsquo;re imagining. A representative will help refine the details, then send one organized plan to Antonio for review.</p>
          <div className="bws-planner-trust">
            <span>Pre-consultation planning</span>
            <span>26+ years&rsquo; ceremony experience</span>
            <span>Nassau, The Bahamas</span>
          </div>
        </section>
        <Suspense fallback={null}>
          <WeddingPlanner />
        </Suspense>
      </main>
      <footer className="bws-planner-footer">
        <span>Bahamas Weddings By The Sea · Planning desk managed by The Beckfords</span>
        <a href="tel:+12424241262">Call +1 (242) 424-1262</a>
        <Link href="/weddings/bahamas-by-the-sea">Return to main site</Link>
      </footer>
    </div>
  );
}
