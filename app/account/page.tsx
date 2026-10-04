import Link from "next/link";
import { SignOutButton } from "@/app/_components/auth/SignOutButton";
import { InstallPrompt } from "@/app/_components/InstallPrompt";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { formatPhoneDisplay } from "@/lib/phone";
import { listAccountBookings, type AccountBookings, type AccountRegistration } from "@/db/accountBookings";
import { getMemberCard, listMemberRedemptions, type MemberRedemption } from "@/db/memberPerks";
import { requireSignedIn } from "@/lib/auth/guards";
import { destinationsFor } from "@/lib/auth/routing";
import { NameForm } from "./NameForm";
import "@/app/_components/perks/perks.css";
import "./account.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My account | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Nassau" }) : "");

const REGISTRATION_STATUS: Record<AccountRegistration["status"], string> = { confirmed: "Confirmed", pending: "Received", waitlist: "Waitlist", trial: "Free taster", cancelled: "Cancelled" };
const PAYMENT: Record<AccountRegistration["payment"], string> = { paid: "Paid", part: "Part paid", due: "Payment due", none: "" };

// Where a customer lands after signing up (brief 18, F2): their
// registrations, their bookings, the Member Pass and how to put PortPass
// on their phone. Everything here is matched to the account's own proven
// email address. No medical, emergency or contact field is ever read for
// this page (db/accountBookings.ts), and of a child only the first name.
export default async function AccountPage() {
  const session = await requireSignedIn("/account");
  const places = destinationsFor(session).filter((d) => d.kind !== "account");
  // Decoration on the page: a failed read shows an empty list, never an error.
  const [perksUsed, booked, card] = await Promise.all([
    listMemberRedemptions(session.userId).catch((): MemberRedemption[] => []),
    listAccountBookings(session.email).catch((error): AccountBookings => {
      console.error("account: bookings not loaded", (error as { code?: string } | null)?.code ?? "");
      return { registrations: [], bookings: [] };
    }),
    getMemberCard(session.userId).catch(() => null),
  ]);
  // A name made from the email address is only a stand-in ("Member" to a
  // business): ask for the real one here.
  const needsName = !card || card.firstName === "Member";
  const greeting = needsName ? "Welcome" : `Hi, ${card.firstName}`;

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My account", href: "/account" }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />My account</div>
        <h1>{greeting}.</h1>
        {needsName && <NameForm />}

        <section className="account-section" aria-labelledby="account-registrations">
          <h2 id="account-registrations">Your registrations</h2>
          {booked.registrations.length === 0 ? (
            <p className="auth-lead">Classes and camps you register for with <strong>{session.email ?? "this email"}</strong> show up here. <Link href="/sports-fitness">See what&rsquo;s open →</Link></p>
          ) : (
            <ul className="account-list">
              {booked.registrations.map((r) => (
                <li key={r.reference}>
                  <div>
                    <strong>{r.childFirstName ? `${r.childFirstName}: ` : ""}{r.what || "Registration"}</strong>
                    <span>{r.business} · {r.reference}{r.submittedAt ? ` · ${day(r.submittedAt)}` : ""}</span>
                  </div>
                  <div className="account-list-state">
                    <b>{REGISTRATION_STATUS[r.status]}</b>
                    {r.status !== "cancelled" && r.status !== "waitlist" && r.status !== "trial" && PAYMENT[r.payment] && <span>{PAYMENT[r.payment]}</span>}
                    {r.href && <Link href={r.href}>Check status →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="account-section" aria-labelledby="account-bookings">
          <h2 id="account-bookings">Your bookings</h2>
          {booked.bookings.length === 0 ? (
            <p className="auth-lead">Private sessions, orders, wedding enquiries and payment requests made with this email show up here.</p>
          ) : (
            <ul className="account-list">
              {booked.bookings.map((b) => (
                <li key={b.key}>
                  <div>
                    <strong>{b.kind}{b.what ? `: ${b.what}` : ""}</strong>
                    <span>{b.business}{b.when ? ` · ${day(b.when)}` : ""}</span>
                  </div>
                  <div className="account-list-state">
                    <b>{b.status}</b>
                    {b.href && <Link href={b.href}>Open →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="account-section">
          <h2>Member Pass</h2>
          <p className="auth-lead">Show it at the counter for member perks. It works on your phone even with no signal.</p>
          <p className="account-pass-links"><Link className="primary-button" href="/pass">Open my Member Pass</Link> <Link href="/perks">See member perks →</Link></p>
          {perksUsed.length > 0 && (
            <>
              <h3 className="account-subhead">Perks you&rsquo;ve used</h3>
              <ul className="account-places">
                {perksUsed.map((used) => (
                  <li key={used.id}><strong>{used.perkTitle}</strong> <span>{used.businessName} · {day(used.redeemedAt)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="account-section">
          <InstallPrompt heading="Install the app" />
        </div>

        <section className="account-section">
          <h2>My details</h2>
          <dl className="account-details">
            <div><dt>Name</dt><dd>{needsName ? "Not added yet" : session.profile?.fullName ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{session.email ?? "—"}</dd></div>
            <div><dt>Phone</dt><dd>{session.profile?.phoneE164 ? formatPhoneDisplay(session.profile.phoneE164) : "—"}</dd></div>
          </dl>
          {!needsName && <NameForm current={session.profile?.fullName ?? ""} compact />}
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
