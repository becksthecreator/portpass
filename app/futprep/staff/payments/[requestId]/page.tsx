import { notFound } from "next/navigation";
import { RequestDetailView } from "@/app/_components/payments/views";
import { futprepPaymentsAccess, positiveId } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment request | Futprep staff", robots: { index: false, follow: false } };

export default async function FutprepPaymentRequestPage({ params, searchParams }: { params: Promise<{ requestId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { requestId } = await params;
  const id = positiveId(requestId);
  if (!id) notFound();
  const access = await futprepPaymentsAccess(`/futprep/staff/payments/${id}`);
  const { created } = await searchParams;
  return <RequestDetailView access={access} requestId={id} created={created === "1"} />;
}
