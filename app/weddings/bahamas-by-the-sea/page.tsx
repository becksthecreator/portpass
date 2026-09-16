import Link from "next/link";
import { WeddingPlanner } from "./WeddingPlanner";

export const metadata = {
  title: "Bahamas Weddings By The Sea | PortPass",
  description: "A calmer planning experience for destination couples in Nassau, The Bahamas.",
};

export default function BahamasWeddingsByTheSeaPage() {
  return (
    <main className="weddings-theme">
      <header className="weddings-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <nav>
          <a href="#planner">Start planning</a>
          <a href="#venues">Venues</a>
        </nav>
      </header>

      <section className="weddings-hero">
        <span>Bahamas Weddings By The Sea · Nassau</span>
        <h1>Your wedding,<br /><em>by the sea.</em></h1>
        <p>A calmer planning experience for destination couples — guided by the Beckfords Wedding Desk, personally reviewed by Antonio.</p>
        <a className="primary-button" href="#planner">Start your plan →</a>
      </section>

      <section className="weddings-journey">
        <span className="eyebrow">How it works</span>
        <h2>Start from anywhere. We&apos;ll shape the details together.</h2>
        <div className="weddings-journey-grid">
          <div><span>01</span><strong>Plan online</strong><p>Tell us about your ceremony, travel, and the services you have in mind.</p></div>
          <div><span>02</span><strong>Meet the Wedding Desk</strong><p>A call, WhatsApp video, or guided text conversation — whatever is easiest for you.</p></div>
          <div><span>03</span><strong>Antonio reviews</strong><p>Availability, ceremony details, and your personal quote — reviewed and confirmed by Antonio himself.</p></div>
        </div>
      </section>

      <section className="weddings-venues" id="venues">
        <span className="eyebrow">Venues</span>
        <h2>Our approved venue partners are being confirmed.</h2>
        <p>We&apos;re building a curated list of Nassau&apos;s best wedding-ready locations. Tell us your preference in the planner below and we&apos;ll match you personally — a venue choice stays a request until availability and terms are confirmed.</p>
      </section>

      <section className="weddings-planner-section" id="planner">
        <WeddingPlanner />
      </section>

      <footer className="weddings-footer">
        <p>Bahamas Weddings By The Sea · Powered by PortPass Bahamas</p>
      </footer>
    </main>
  );
}
