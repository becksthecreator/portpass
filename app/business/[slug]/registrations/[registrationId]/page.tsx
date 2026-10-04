import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationDetail } from "@/app/_components/registrations/views";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { getBusinessRegistration } from "@/db/businessRegistrations";
import { requireOrgRole } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registration | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// One registration (brief 18, D4). A child's health, emergency and pickup
// details are read and shown only to team members with the "can see
// medical details" permission (owners and admins always have it). PortPass
// staff opening a business through the platform door do not see them. An
// adult's registration has none.
export default async function BusinessRegistrationPage({ params }: { params: Promise<{ slug: string; registrationId: string }> }) {
  const { slug, registrationId } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/registrations/${registrationId}`);
  const id = Number(registrationId);
  const business = await getBusinessBySlug(slug);
  if (!business || !Number.isInteger(id) || id <= 0) notFound();
  const [r, payments] = await Promise.all([getBusinessRegistration(business.id, id, { mayViewHealth: access.canViewMedical }), handlesPayments(access)]);
  if (!r) notFound();

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Registrations", href: `/business/${slug}/registrations` }, { label: r.reference, href: `/business/${slug}/registrations/${r.id}` }]} />
      <div className="auth-card auth-card-wide">
        <RegistrationDetail
          registration={r}
          listHref={`/business/${slug}/registrations`}
          actionsEndpoint={`/api/business/orgs/${business.id}/registrations/${r.id}`}
          requestPayment={payments ? <Link className="primary-button" href={`/business/${slug}/payments/new?registration=${r.id}`}>Request payment</Link> : null}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
