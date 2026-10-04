import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationsList } from "@/app/_components/registrations/views";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug } from "@/db/business";
import { listBusinessPrograms, listBusinessRegistrations } from "@/db/businessRegistrations";
import { requireOrgRole } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registrations | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// A business's own Registrations screen (brief 18, D4): its classes and
// camps, who has registered, and "Request payment" on each. The same
// tables Futprep's staff desk reads, for any business, through the team's
// own sign-in. No health or emergency detail is in this list; one
// registration's are shown only to team members allowed to see them.
export default async function BusinessRegistrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/registrations`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const [programs, registrations, payments] = await Promise.all([listBusinessPrograms(business.id), listBusinessRegistrations(business.id), handlesPayments(access)]);
  const canEdit = access.membership ? access.membership.role === "org_owner" || access.membership.role === "org_admin" : Boolean(access.session.platformRole);
  // Futprep's public form is its own; every other business uses the shared one.
  const registerHref = slug === "futprep" ? "/futprep/register" : business.primaryCategory ? `/${business.primaryCategory}/${slug}/register` : null;

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Registrations", href: `/business/${slug}/registrations` }]} />
      <div className="auth-card auth-card-wide">
        <RegistrationsList
          business={{ id: business.id, name: business.name, isPublished: business.isPublished }}
          programs={programs}
          registrations={registrations}
          basePath={`/business/${slug}/registrations`}
          homeHref={`/business/${slug}`}
          homeLabel="Back to my business"
          registerHref={registerHref}
          canEdit={canEdit}
          requestPayment={payments ? (id) => <Link href={`/business/${slug}/payments/new?registration=${id}`}>Request payment →</Link> : null}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
