import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { getBusinessBySlug, listBusinessOfferings } from "@/db/business";
import { requireOrgRole } from "@/lib/auth/guards";
import { workspaceLinks } from "@/lib/orgWorkspaces";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

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

// v1 business home: where you stand, where to go. Today's schedule and
// balances arrive with the staff-view adapters (block 6).
export default async function BusinessHomePage({ params }: { params: Params }) {
  const { slug } = await params;
  const access = await requireOrgRole({ slug }, "org_viewer", `/business/${slug}`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const offerings = await listBusinessOfferings(business.id);
  const status = STATUS_COPY[business.status] ?? STATUS_COPY.draft;
  const canEdit = access.membership ? access.membership.role === "org_owner" || access.membership.role === "org_admin" : Boolean(access.session.platformRole);
  const tools = workspaceLinks(slug);
  const publicHref = business.primaryCategory ? `/${business.primaryCategory}/${slug}` : null;

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />{status.label}</div>
        <h1>{business.name}</h1>
        <p className="auth-lead">{status.detail}</p>

        <div className="biz-home-grid">
          {business.status === "draft" && canEdit && (
            <Link className="chooser-card" href="/business/setup"><strong>Finish setup</strong><span>Pick up where you left off</span><b>Continue →</b></Link>
          )}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/settings`}><strong>Settings</strong><span>Details, photos, prices, payments</span><b>Open →</b></Link>}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/settings?step=6`}><strong>Team</strong><span>Invite staff, set who sees what</span><b>Open →</b></Link>}
          {canEdit && <Link className="chooser-card" href={`/business/${slug}/growth`}><strong>Growth report</strong><span>Found you, asked, booked, paid, showed up</span><b>Open →</b></Link>}
          <Link className="chooser-card" href={`/business/${slug}/preview`}><strong>Preview page</strong><span>Exactly what customers will see</span><b>Open →</b></Link>
          {business.isPublished && publicHref && (
            <a className="chooser-card" href={publicHref}><strong>Public page</strong><span>Live on PortPass</span><b>Open →</b></a>
          )}
        </div>

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
