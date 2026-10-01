import { notFound } from "next/navigation";
import { EditRequestView } from "@/app/_components/payments/views";
import { futprepPaymentsAccess, positiveId } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change payment request | Futprep staff", robots: { index: false, follow: false } };

export default async function FutprepEditPaymentRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const id = positiveId(requestId);
  if (!id) notFound();
  const access = await futprepPaymentsAccess(`/futprep/staff/payments/${id}/edit`);
  return <EditRequestView access={access} requestId={id} />;
}
