import Link from "next/link";
import { SignOutButton } from "@/app/_components/auth/SignOutButton";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { formatPhoneDisplay } from "@/lib/phone";
import { listMemberRedemptions, type MemberRedemption } from "@/db/memberPerks";
import { requireSignedIn } from "@/lib/auth/guards";
import { destinationsFor } from "@/lib/auth/routing";
import "@/app/_components/perks/perks.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My account | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// v1 is deliberately thin: who you are and where you can go. Bookings and
// children (linked through the people record) arrive in the account
// block that follows; no medical fields are ever rendered here.
export default async function AccountPage() {
  const session = await requireSignedIn("/account");
  const name = session.profile?.fullName ?? session.email ?? "there";
  const places = destinationsFor(session).filter((d) => d.kind !== "account");
  // Decoration on the page: a failed read shows no list, never an error.
  const perksUsed = await listMemberRedemptions(session.userId).catch((): MemberRedemption[] => []);

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My account", href: "/account" }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />My account</div>
        <h1>Hi, {name.split(" ")[0]}.</h1>

        <section className="account-section">
          <h2>Member Pass</h2>
          <p className="auth-lead">Show it at the counter for member perks. It works on your phone even with no signal.</p>
          <p className="account-pass-links"><Link className="primary-button" href="/pass">Open my Member Pass</Link> <Link href="/perks">See member perks →</Link></p>
          {perksUsed.length > 0 && (
            <>
              <h3 className="account-subhead">Perks you&rsquo;ve used</h3>
              <ul className="account-places">
                {perksUsed.map((used) => (
                  <li key={used.id}><strong>{used.perkTitle}</strong> <span>{used.businessName} · {new Date(used.redeemedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Nassau" })}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="account-section">
          <h2>My bookings</h2>
          <p className="auth-lead">Bookings made with this email will show up here as they&rsquo;re linked. Registered a child or sent a wedding enquiry before you had an account? It&rsquo;ll appear once we connect it.</p>
        </section>

        <section className="account-section">
          <h2>My details</h2>
          <dl className="account-details">
            <div><dt>Name</dt><dd>{session.profile?.fullName ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{session.email ?? "—"}</dd></div>
            <div><dt>Phone</dt><dd>{session.profile?.phoneE164 ? formatPhoneDisplay(session.profile.phoneE164) : "—"}</dd></div>
          </dl>
        </section>

        {places.length > 0 && (
          <section className="account-section">
            <h2>Your other places</h2>
            <ul className="account-places">
              {places.map((p) => (
                <li key={p.href}><Link href={`/api/auth/go?to=${encodeURIComponent(p.href)}`}>{p.label}</Link> <span>{p.detail}</span></li>
              ))}
            </ul>
          </section>
        )}

        <div className="auth-actions">
          <SignOutButton className="primary-button" />
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
