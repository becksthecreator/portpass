import { NewRequestView } from "@/app/_components/payments/views";
import { requireOrgRole } from "@/lib/auth/guards";
import { businessPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "New payment request | PortPass Bahamas", robots: { index: false, follow: false } };

// ?registration=, ?privateSession=, ?reservation= or ?booking= fills it in from that record.
export default async function BusinessNewPaymentRequestPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const access = await businessPaymentsAccess(await requireOrgRole({ slug }, "org_staff", `/business/${slug}/payments/new`));
  return <NewRequestView access={access} params={await searchParams} />;
}
