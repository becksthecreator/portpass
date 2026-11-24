import Link from "next/link";
import { SignOutButton } from "@/app/_components/auth/SignOutButton";
import { InstallPrompt } from "@/app/_components/InstallPrompt";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { listAccountBookings, type AccountBookings, type AccountRegistration } from "@/db/accountBookings";
import { listThisWeek } from "@/db/parentHome";
import type { ThisWeekCard } from "@/lib/parentHome";
import { mapsUrl } from "@/lib/quickRegistration";
import { getMemberCard, listMemberRedemptions, type MemberRedemption } from "@/db/memberPerks";
import { getMyPoints, type MyPoints } from "@/db/points";
import { formatPointsDelta, howPointsAreEarned, pointsEventLabel, POINTS_RULES } from "@/lib/points";
import { requireSignedIn } from "@/lib/auth/guards";
import { destinationsFor } from "@/lib/auth/routing";
import { NameForm } from "./NameForm";
import { SignOutEverywhere } from "./SignOutEverywhere";
import "@/app/_components/perks/perks.css";
import "./account.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My account | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// "Sat 28 Nov", from a calendar day (no time zone shift).
const classDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

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
  const [perksUsed, booked, card, points, thisWeek] = await Promise.all([
    listMemberRedemptions(session.userId).catch((): MemberRedemption[] => []),
    listAccountBookings(session.email).catch((error): AccountBookings => {
      console.error("account: bookings not loaded", (error as { code?: string } | null)?.code ?? "");
      return { registrations: [], bookings: [] };
    }),
    getMemberCard(session.userId).catch(() => null),
    getMyPoints(session.userId).catch((error): MyPoints | null => {
      console.error("account: points not loaded", (error as { code?: string } | null)?.code ?? "");
      return null;
    }),
    listThisWeek(session.email).catch((error): ThisWeekCard[] => {
      console.error("account: this week not loaded", (error as { code?: string } | null)?.code ?? "");
      return [];
    }),
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

        {/* Parent home (PR 2, 24 Nov): each child's next session, what's
            owed, the coaches' latest update and the way back to the
            business's site, before the full lists below. */}
        {thisWeek.length > 0 && (
          <section className="account-section account-week" aria-labelledby="account-week">
            <h2 id="account-week">Coming up</h2>
            <ul className="week-list">
              {thisWeek.map((c) => (
                <li key={c.reference} className="week-card">
                  <div className="week-head">
                    <strong>{c.childFirstName ? `${c.childFirstName}: ` : ""}{c.className}</strong>
                    <span>{c.business}{c.status === "trial" ? " · Free taster" : c.status === "pending" ? " · Received" : ""}</span>
                  </div>
                  {c.next && (
                    <dl className="week-facts">
                      <div><dt>Next</dt><dd><b>{classDay(c.next.date)}</b>{c.next.time ? ` · ${c.next.time}` : ""}</dd></div>
                      {c.next.place && <div><dt>Where</dt><dd>{c.next.place}{c.next.placeNote ? ` (${c.next.placeNote})` : ""} <a href={mapsUrl(c.next.place, c.next.placeNote)} target="_blank" rel="noopener noreferrer">Map ↗</a></dd></div>}
                      {c.owed && <div><dt>{c.owed.label}</dt><dd>{c.owed.amountCents ? <b>{formatPriceCents(c.owed.amountCents)}</b> : null}{c.owed.amountCents ? " · " : ""}ref {c.reference}{c.statusHref ? <> · <Link href={c.statusHref}>How to pay →</Link></> : null}</dd></div>}
                    </dl>
                  )}
                  {c.latest && (
                    <blockquote className="week-update">
                      <p>{c.latest.body}</p>
                      <footer>{c.latest.author}{c.statusHref?.startsWith("/futprep/") ? <> · <Link href="/futprep/feed">All updates →</Link></> : null}</footer>
                    </blockquote>
                  )}
                  {c.businessHref && <a className="week-back" href={c.businessHref} {...(c.businessHref.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.business ? `${c.business}` : "The business"}&rsquo;s site{c.businessHref.startsWith("http") ? " ↗" : " →"}</a>}
                </li>
              ))}
            </ul>
            <p className="account-pass-links"><Link className="primary-button" href="/pass">Open my Member Pass</Link></p>
          </section>
        )}

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
          {booked.registrations.some((r) => r.href?.startsWith("/futprep/") && r.status !== "cancelled" && r.status !== "waitlist") && (
            <p className="auth-lead"><Link href="/futprep/feed">Class updates from your Futprep coaches →</Link></p>
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

        {points && (
          <section className="account-section" aria-labelledby="account-points">
            <h2 id="account-points">Your PortPass Points</h2>
            <p className="account-points-balance"><strong>{points.balance.toLocaleString("en-US")}</strong> {points.balance === 1 ? "point" : "points"}</p>
            <p className="auth-lead">{howPointsAreEarned(points.rules)} They can&rsquo;t be spent on anything.</p>
            {points.events.length > 0 && (
              <ul className="account-list">
                {points.events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>{pointsEventLabel(event)}</strong>
                      <span>{day(event.createdAt)}{event.expiresAt && event.delta > 0 && !event.settled ? ` · expires ${day(event.expiresAt)}` : ""}</span>
                    </div>
                    <div className="account-list-state"><b>{formatPointsDelta(event.delta)}</b></div>
                  </li>
                ))}
              </ul>
            )}
            <p className="account-points-rules">{POINTS_RULES}</p>
          </section>
        )}

        <section className="account-section" aria-labelledby="account-security">
          <h2 id="account-security">Security</h2>
          <p className="auth-lead">You stay signed in on this device for 30 days after your last visit. If you signed in on a phone or computer you no longer use, sign out of all of them at once.</p>
          <SignOutEverywhere />
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
