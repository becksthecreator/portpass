import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { eventName } from "@/lib/eventSignup";
import { getSectionOptions } from "@/lib/navSections";
import { EventSignupForm } from "./EventSignupForm";
import "./event.css";

// The page behind /own and /join/<event> (brief 18, part C): a 30-second
// form for a business owner standing at a stall. Sections come from the
// categories table, with the compiled list as the fallback.
export async function EventSignupPage({ event, path }: { event: string; path: string }) {
  const sections = await getSectionOptions();
  return (
    <main className="form-page join-page">
      <SiteHeader breadcrumb={[{ label: "Sign up", href: path }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />{eventName(event)}</div>
        <h1>Get your business on PortPass.</h1>
        <p>Your prices, your photos and a booking button in one link. Tell us who you are and we&rsquo;ll build the page with you. Customers pay you directly.</p>
      </section>
      <EventSignupForm event={event} sections={sections} />
      <p className="join-more">Want to look first? <Link href="/demo">Try a demo business →</Link> · <Link href="/pricing">Pricing</Link></p>
      <SiteFooter />
    </main>
  );
}
