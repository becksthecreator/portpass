import { notFound } from "next/navigation";
import { RequestDetailView } from "@/app/_components/payments/views";
import { requireOrgRole } from "@/lib/auth/guards";
import { businessPaymentsAccess, positiveId } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment request | PortPass Bahamas", robots: { index: false, follow: false } };

export default async function BusinessPaymentRequestPage({ params, searchParams }: { params: Promise<{ slug: string; requestId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { slug, requestId } = await params;
  const id = positiveId(requestId);
  if (!id) notFound();
  const access = await businessPaymentsAccess(await requireOrgRole({ slug }, "org_staff", `/business/${slug}/payments/${id}`));
  const { created } = await searchParams;
  return <RequestDetailView access={access} requestId={id} created={created === "1"} />;
}
