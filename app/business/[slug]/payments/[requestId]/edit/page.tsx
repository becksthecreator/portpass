import { notFound } from "next/navigation";
import { EditRequestView } from "@/app/_components/payments/views";
import { requireOrgRole } from "@/lib/auth/guards";
import { businessPaymentsAccess, positiveId } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change payment request | PortPass Bahamas", robots: { index: false, follow: false } };

export default async function BusinessEditPaymentRequestPage({ params }: { params: Promise<{ slug: string; requestId: string }> }) {
  const { slug, requestId } = await params;
  const id = positiveId(requestId);
  if (!id) notFound();
  const access = await businessPaymentsAccess(await requireOrgRole({ slug }, "org_staff", `/business/${slug}/payments/${id}/edit`));
  return <EditRequestView access={access} requestId={id} />;
}
