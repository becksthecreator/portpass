import { notFound } from "next/navigation";
import { AttendanceView } from "@/app/_components/attendance/AttendanceView";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { requireOrgRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Attendance | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// A business's attendance register (brief 18, part B): the sessions of its
// classes and camps, and who came. Names only; a child's health, emergency
// and pickup details stay on the registration, for the team members the
// owner allows.
export default async function BusinessAttendancePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ session?: string }> }) {
  const { slug } = await params;
  await requireOrgRole({ slug }, "org_staff", `/business/${slug}/attendance`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const { session } = await searchParams;
  const sessionId = session && /^\d{1,12}$/.test(session) ? Number(session) : null;

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Attendance", href: `/business/${slug}/attendance` }]} />
      <div className="auth-card auth-card-wide">
        <AttendanceView
          organizationId={business.id}
          businessName={business.name}
          basePath={`/business/${slug}/attendance`}
          endpoint={`/api/business/orgs/${business.id}/attendance`}
          sessionId={sessionId}
          homeHref={`/business/${slug}`}
          homeLabel="Back to my business"
        />
      </div>
      <SiteFooter />
    </main>
  );
}
