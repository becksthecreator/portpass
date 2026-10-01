import { RequestsView } from "@/app/_components/payments/views";
import { requireOrgRole } from "@/lib/auth/guards";
import { businessPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments | Business | PortPass Bahamas", robots: { index: false, follow: false } };

// Payments -> Requests (brief 17): what's collected, outstanding and overdue.
export default async function BusinessPaymentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ filter?: string }> }) {
  const { slug } = await params;
  const access = await businessPaymentsAccess(await requireOrgRole({ slug }, "org_staff", `/business/${slug}/payments`));
  const { filter } = await searchParams;
  return <RequestsView access={access} filter={filter} />;
}
