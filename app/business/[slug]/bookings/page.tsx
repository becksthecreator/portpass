import { notFound } from "next/navigation";
import { BookingsList } from "@/app/_components/bookings/views";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { bookingPayments, listBookings } from "@/db/bookingRequests";
import { getBusinessBySlug } from "@/db/business";
import { requireOrgRole } from "@/lib/auth/guards";
import { isBookingTab } from "@/lib/bookings/rules";
import { handlesPayments } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bookings | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// A business's own Bookings screen (brief 19, A4): the requests customers
// have made for its priced offerings: new, confirmed, done, declined.
// Team members only (staff and up). "Request payment" and the links to a
// booking's payment request are shown only to people who handle payments.
export default async function BusinessBookingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/bookings`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const query = await searchParams;
  const tab = isBookingTab(query.tab) ? query.tab : "new";
  const [bookings, payments] = await Promise.all([listBookings(business.id), handlesPayments(access)]);
  const linked = await bookingPayments(business.id, bookings);

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Bookings", href: `/business/${slug}/bookings` }]} />
      <div className="auth-card auth-card-wide">
        <BookingsList
          business={{ name: business.name, isPublished: business.isPublished }}
          bookings={bookings}
          payments={linked}
          tab={tab}
          basePath={`/business/${slug}/bookings`}
          homeHref={`/business/${slug}`}
          apiBase={`/api/business/orgs/${business.id}/bookings`}
          paymentsPath={payments ? `/business/${slug}/payments` : null}
          publicHref={business.primaryCategory ? `/${business.primaryCategory}/${slug}` : null}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
