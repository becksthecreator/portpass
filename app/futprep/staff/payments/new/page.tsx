import { NewRequestView } from "@/app/_components/payments/views";
import { futprepPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "New payment request | Futprep staff", robots: { index: false, follow: false } };

// "Request payment" on a registration or a private session lands here with
// ?registration= or ?privateSession=, already filled in.
export default async function FutprepNewPaymentRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const access = await futprepPaymentsAccess("/futprep/staff/payments/new");
  return <NewRequestView access={access} params={await searchParams} />;
}
