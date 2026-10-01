import Link from "next/link";
import { notFound } from "next/navigation";
import { GrowthReportView } from "@/app/_components/growth/GrowthReportView";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { getGrowthReport } from "@/db/growth";
import { requireOrgRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  return { title: `${slug} | Growth report | PortPass Bahamas`, robots: { index: false, follow: false } };
}

// The growth report in the business dashboard (brief 05, part 2): for the
// business's owner and admins, and for PortPass staff after the
// authenticator step. Nothing about a child's health or emergency contact
// is read for it.
export default async function BusinessGrowthPage({ params }: { params: Params }) {
  const { slug } = await params;
  await requireOrgRole({ slug }, "org_admin", `/business/${slug}/growth`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const report = await getGrowthReport({ id: business.id, name: business.name });

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Growth", href: `/business/${slug}/growth` }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />Growth report</div>
        <h1>{business.name}</h1>
        <GrowthReportView report={report} />
        <p className="auth-alt"><Link href={`/business/${slug}`}>Back to my business</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
