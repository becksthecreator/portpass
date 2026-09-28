import Link from "next/link";
import { notFound } from "next/navigation";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { getBusinessBySlug } from "@/db/business";
import { getOrganizationListingForPreview } from "@/db/organizations";
import { requireOrgRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The public template, rendered for the people allowed to see the draft.
// Offerings without a price don't appear, exactly as they won't in public.
export default async function BusinessPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireOrgRole({ slug }, "org_viewer", `/business/${slug}/preview`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const listing = await getOrganizationListingForPreview(business.id);
  if (!listing) notFound();

  return (
    <div className={`${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Preview", href: `/business/${slug}/preview` }]} />
      <div className="preview-banner" role="status">
        <strong>Preview</strong> — this is how your page will look. {business.isPublished ? "It's live." : "It isn't public yet."}{" "}
        <Link href={`/business/${slug}/settings`}>Edit</Link>
      </div>
      <OrganizationTemplate listing={listing} />
      <SiteFooter orgLine={`${business.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
