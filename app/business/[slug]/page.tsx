import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import "@/app/_components/bookings/bookings.css";
import { countNewBookings } from "@/db/bookingRequests";
import { getBusinessBySlug, listBusinessOfferings } from "@/db/business";
import { getBusinessChecklist } from "@/db/pageChecklist";
import { MissingFromPage } from "@/app/_components/checklist/PageChecklist";
import { requireOrgRole } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { workspaceLinks } from "@/lib/orgWorkspaces";
import { OwnerDashboard } from "@/app/_components/dashboard/OwnerDashboard";
import { GoogleReviewCard } from "./GoogleReviewCard";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Query = Promise<{ month?: string; status?: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  return { title: `${slug} | Business home | PortPass Bahamas`, robots: { index: false, follow: false } };
}

const STATUS_COPY: Record<string, { label: string; detail: string }> = {
  draft: { label: "Draft", detail: "Not submitted yet. Finish the setup and send it for review." },
  submitted: { label: "Under review", detail: "We're reviewing it. Expect a reply within 2 business days." },
  approved: { label: "Approved", detail: "Approved. It goes live the moment an offering has a price." },
  live: { label: "Live", detail: "Your page is public and taking bookings." },
  suspended: { label: "Suspended", detail: "Your page is hidden. Contact PortPass." },
};

// The business home: where you stand, where to go, and (brief 27, B) the
// owner's dashboard of money and attendance, first thing after sign-in.
export default async function BusinessHomePage({ params, searchParams }: { params: Params; searchParams: Query }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const access = await requireOrgRole({ slug }, "org_viewer", `/business/${slug}`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const offerings = await listBusinessOfferings(business.id);
  const status = STATUS_COPY[business.status] ?? STATUS_COPY.draft;
  const canEdit = access.membership ? access.membership.role === "org_owner" || access.membership.role === "org_admin" : Boolean(access.session.platformRole);
  const tools = workspaceLinks(slug);
  const payments = await handlesPayments(access);
  const isTeam = canEdit || access.membership?.role === "org_staff";
  // New booking requests waiting for an answer (brief 19, A3): the
  // dashboard item. A failed count just leaves the number off.
  const newBookings = isTeam ? await countNewBookings(business.id).catch(() => 0) : 0;
  // What the page is missing (brief 19, part D), read from the data. A
  // failed read leaves the section off rather than the page down.
  const checklist = isTeam ? await getBusinessChecklist(business.id).catch(() => null) : null;
  const publicHref = business.primaryCategory ? `/${business.primaryCategory}/${slug}` : null;

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />{status.label}</div>
        <h1>{business.name}</h1>
        <p className="auth-lead">{status.detail}</p>
        {business.status === "draft" && business.reviewNote && (
          <div className="biz-review-note" role="note">
            <strong>PortPass asked for a few changes</strong>
            <p>{business.reviewNote}</p>
            <p>Make the changes, then send it to us again.</p>
          </div>
        )}

        {/* Owners and admins see money and attendance; staff (coaches) see
            attendance, and money only with the payments permission. */}
        {isTeam && <OwnerDashboard orgId={business.id} basePath={`/business/${slug}`} showMoney={payments} query={query} />}

        <div className="biz-home-grid">
          {business.status === "draft" && canEdit && (
            <Link className="chooser-card" href="/business/setup"><strong>Finish setup</strong><span>Pick up where you left off</span><b>Continue →</b></Link>
          )}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/settings`}><strong>Settings</strong><span>Details, photos, prices, payments</span><b>Open →</b></Link>}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/settings?step=6`}><strong>Team</strong><span>Invite staff, set who sees what</span><b>Open →</b></Link>}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/billing`}><strong>Your plan</strong><span>What you pay PortPass, and your invoices</span><b>Open →</b></Link>}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/growth`}><strong>Growth report</strong><span>Found you, asked, booked, paid, showed up</span><b>Open →</b></Link>}
          {(canEdit || access.membership?.role === "org_staff") && (
            <Link className="chooser-card" href={`/business/${slug}/shop`}><strong>Shop</strong><span>Products, drops and reservations</span><b>Open →</b></Link>
          )}
          {(canEdit || access.membership?.role === "org_staff") && (
            <Link className="chooser-card" href={`/business/${slug}/perks`}><strong>Member perks</strong><span>Offer a perk, check a Member Pass</span><b>Open →</b></Link>
          )}
          {isTeam && (
            <Link className="chooser-card" href={`/business/${slug}/bookings`}>
              <strong>Bookings{newBookings > 0 && <span className="bkg-home-count">{newBookings} new</span>}</strong>
              <span>{newBookings > 0 ? (newBookings === 1 ? "1 request is waiting for your answer" : `${newBookings} requests are waiting for your answer`) : "Requests to book your offerings"}</span>
              <b>Open →</b>
            </Link>
          )}
          {(canEdit || access.membership?.role === "org_staff") && <Link className="chooser-card" href={`/business/${slug}/registrations`}><strong>Registrations</strong><span>Classes and camps, who has registered</span><b>Open →</b></Link>}
          {(canEdit || access.membership?.role === "org_staff") && <Link className="chooser-card" href={`/business/${slug}/attendance`}><strong>Attendance</strong><span>Mark who came to each session</span><b>Open →</b></Link>}
          {payments && <Link className="chooser-card" href={`/business/${slug}/payments`}><strong>Payments</strong><span>Request payment, mark paid, chase</span><b>Open →</b></Link>}
          <Link className="chooser-card" href={`/business/${slug}/preview`}><strong>Preview page</strong><span>Exactly what customers will see</span><b>Open →</b></Link>
          {business.isPublished && publicHref && (
            <a className="chooser-card" href={publicHref}><strong>Public page</strong><span>Live on PortPass</span><b>Open →</b></a>
          )}
        </div>

        {business.googleBusinessUrl && business.isPublished && <GoogleReviewCard businessName={business.name} url={business.googleBusinessUrl} />}
        {!business.googleBusinessUrl && canEdit && business.isPublished && (
          <p className="auth-hint">On Google Maps? <Link href={`/business/${slug}/settings?step=2`}>Add your Google Business Profile link</Link> to ask customers for Google reviews.</p>
        )}

        {checklist && <MissingFromPage items={checklist.items} canFix={canEdit} />}

        <section className="account-section">
          <h2>Offerings</h2>
          {offerings.length === 0 ? (
            <p className="auth-lead">Nothing listed yet.</p>
          ) : (
            <ul className="account-places">
              {offerings.map((o) => (
                <li key={o.id}>
                  <strong>{o.name}</strong>
                  <span>{o.priceCents === null ? "Draft — no price yet" : `$${(o.priceCents / 100).toFixed(0)}${o.priceUnit ? ` · ${o.priceUnit.replace("_", " ")}` : ""}${o.isPublished ? "" : " · not published"}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {tools.length > 0 && (
          <section className="account-section">
            <h2>Your staff tools</h2>
            <p className="auth-lead">These still use the staff PIN login for now.</p>
            <ul className="account-places">
              {tools.map((t) => <li key={t.href}><Link href={t.href}>{t.label}</Link> <span>{t.detail}</span></li>)}
            </ul>
          </section>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
