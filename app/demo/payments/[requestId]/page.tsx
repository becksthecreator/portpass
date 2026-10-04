import { notFound } from "next/navigation";
import { RequestDetailView } from "@/app/_components/payments/views";
import { requireDemo } from "@/lib/auth/demo";
import { demoPaymentsAccess, positiveId } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment request | Demo business | PortPass Bahamas", robots: { index: false, follow: false } };

export default async function DemoPaymentRequestPage({ params, searchParams }: { params: Promise<{ requestId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { org } = await requireDemo();
  const id = positiveId((await params).requestId);
  if (!id) notFound();
  const { created } = await searchParams;
  return <RequestDetailView access={demoPaymentsAccess(org)} requestId={id} created={created === "1"} />;
}
