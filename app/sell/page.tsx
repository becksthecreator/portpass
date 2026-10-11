import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getSession } from "@/lib/auth/session";
import { MADE_IN_BAHAMAS } from "@/lib/market/sellers";
import { MARKET_TAGLINE } from "@/lib/market/copy";
import { SellForm } from "./SellForm";
import "./sell.css";

// /sell (brief 25, A4): the public door for sellers who only want to sell.
// Anyone can read it; applying needs a PortPass account, so the shop that
// follows is theirs to build. Businesses already on PortPass open their
// shop from their own business page instead. Still on purpose: no motion
// (brief 22's Never list).
export const dynamic = "force-dynamic";

const TITLE = "Sell on PortPass Market | PortPass Bahamas";
const DESCRIPTION = "Bahamian makers and shops: list what you sell, get the Made in The Bahamas badge, and take orders that buyers pay you for directly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://portpassbahamas.com/sell" },
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/sell" },
};

export default async function SellPage() {
  const session = await getSession().catch(() => null);
  const shops = (session?.memberships ?? []).filter((m) => (m.role === "org_owner" || m.role === "org_admin") && m.organizationSlug);

  return (
    <main className="form-page sell-page">
      <SiteHeader breadcrumb={[{ label: "Sell on PortPass Market", href: "/sell" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />PortPass Market</div>
        <h1>Sell what you make, here at home.</h1>
        <p>List your products in one place where The Bahamas finds, books and buys. Buyers order on PortPass and pay you directly, by bank transfer or cash. PortPass never holds the money.</p>
        <ol className="sell-steps">
          <li><strong>Apply below.</strong> Your business licence number and a contact person.</li>
          <li><strong>PortPass checks them</strong> and gives your shop the &ldquo;{MADE_IN_BAHAMAS}&rdquo; badge.</li>
          <li><strong>Add your products</strong> while you wait, then open your shop.</li>
        </ol>
      </section>

      {session ? (
        <>
          {shops.length > 0 && (
            <div className="sell-existing">
              <p>Already on PortPass? Sell from the business you have:</p>
              <ul>
                {shops.map((m) => (
                  <li key={m.organizationId}><Link href={`/business/${m.organizationSlug}/shop`}>Open the shop for {m.organizationName} →</Link></li>
                ))}
              </ul>
              <p>Or apply below for a new business that only sells.</p>
            </div>
          )}
          <SellForm defaultContact={session.profile?.fullName ?? ""} />
        </>
      ) : (
        <section className="application-form sell-signin" aria-labelledby="sell-signin-h">
          <h2 id="sell-signin-h">First, sign in</h2>
          <p>Your shop belongs to your PortPass account: sign in (or create an account) and you&rsquo;ll come straight back to this form.</p>
          <div className="sell-signin-actions">
            <Link className="primary-button" href="/login?next=%2Fsell">Sign in</Link>
            <Link className="secondary-button" href="/signup?next=%2Fsell">Create an account</Link>
          </div>
        </section>
      )}
      <p className="sell-tagline">{MARKET_TAGLINE}</p>
      <SiteFooter />
    </main>
  );
}
