import { notFound } from "next/navigation";
import { SetupWizard } from "@/app/business/setup/SetupWizard";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug, listBusinessImages, listBusinessOfferings, listInvites, listTeam } from "@/db/business";
import { getSectionWithSubcategories } from "@/db/categories";
import { getPaymentSettings } from "@/db/paymentRequests";
import { requireOrgRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Business settings | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The same seven steps as the setup wizard, reachable any time after
// approval. Changes to a live listing publish immediately; only name,
// category and payment details send it back for review (db/business.ts).
export default async function BusinessSettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ step?: string }> }) {
  const { slug } = await params;
  const { step } = await searchParams;
  const access = await requireOrgRole({ slug }, "org_admin", `/business/${slug}/settings`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const [paymentSettings, images, offerings, invites, team, section] = await Promise.all([
    getPaymentSettings(business.id).catch(() => null),
    listBusinessImages(business.id),
    listBusinessOfferings(business.id),
    listInvites(business.id),
    listTeam(business.id),
    business.primaryCategory ? getSectionWithSubcategories(business.primaryCategory) : Promise.resolve(null),
  ]);
  const initialStep = Math.min(7, Math.max(1, Number(step) || 1));

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Settings", href: `/business/${slug}/settings` }]} />
      <SetupWizard
        mode="settings"
        business={business}
        images={images}
        offerings={offerings}
        invites={invites}
        team={team}
        section={section}
        role={access.membership?.role ?? (access.session.platformRole ? "org_owner" : "org_viewer")}
        initialStep={initialStep}
        paymentSettings={paymentSettings}
      />
      <SiteFooter />
    </main>
  );
}
