import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { findDraftForUser, listBusinessImages, listBusinessOfferings, listInvites, listTeam } from "@/db/business";
import { getSectionWithSubcategories, listSections } from "@/db/categories";
import { requireSignedIn } from "@/lib/auth/guards";
import { createAuthClient } from "@/lib/auth/server";
import { SetupWizard } from "./SetupWizard";
import { StartBusinessForm } from "./StartBusinessForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set up your business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// Entry to the owner wizard. With an unfinished business it resumes it;
// without one it asks for the two things a draft needs (name, section),
// pre-filled from what they typed at sign-up when that's available.
export default async function BusinessSetupPage() {
  const session = await requireSignedIn("/business/setup");
  const draft = await findDraftForUser(session.userId);

  if (draft) {
    const [images, offerings, invites, team, section] = await Promise.all([
      listBusinessImages(draft.id),
      listBusinessOfferings(draft.id),
      listInvites(draft.id),
      listTeam(draft.id),
      draft.primaryCategory ? getSectionWithSubcategories(draft.primaryCategory) : Promise.resolve(null),
    ]);
    const role = session.memberships.find((m) => m.organizationId === draft.id)?.role ?? "org_owner";
    return (
      <main className="form-page auth-page">
        <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Set up", href: "/business/setup" }]} />
        <SetupWizard mode="setup" business={draft} images={images} offerings={offerings} invites={invites} team={team} section={section} role={role} initialStep={1} />
        <SiteFooter />
      </main>
    );
  }

  let defaultName = "";
  let defaultSection = "";
  try {
    const client = await createAuthClient();
    const { data } = await client.auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    defaultName = typeof meta.business_name === "string" ? meta.business_name : "";
    defaultSection = typeof meta.section === "string" ? meta.section : "";
  } catch {
    // no metadata; the form starts blank
  }
  const sections = await listSections().catch(() => []);
  const existing = session.memberships.filter((m) => m.organizationSlug);

  return (
    <main className="form-page auth-page">
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Set up", href: "/business/setup" }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />Your business on PortPass</div>
        <h1>Let&rsquo;s set up your page.</h1>
        <p className="auth-lead">Seven short steps, saved as you go. You can stop and come back any time — nothing is public until we&rsquo;ve reviewed it with you.</p>
        {existing.length > 0 && (
          <p className="auth-hint">
            You&rsquo;re already part of {existing.map((m) => <Link key={m.organizationId} href={`/business/${m.organizationSlug}`}>{m.organizationName}</Link>).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}. Starting another business is fine too.
          </p>
        )}
        <StartBusinessForm
          defaultName={defaultName}
          defaultSection={defaultSection}
          sections={sections.map((s) => ({ slug: s.slug, name: s.name, subcategories: s.subcategories.map((c) => ({ slug: c.slug, name: c.name })) }))}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
