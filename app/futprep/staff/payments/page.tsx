import { RequestsView } from "@/app/_components/payments/views";
import { futprepPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments | Futprep staff", robots: { index: false, follow: false } };

// Futprep's payment requests for its admin and CEO staff logins (brief 17):
// the same screens as /business/futprep/payments, behind the staff PIN.
export default async function FutprepPaymentsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const access = await futprepPaymentsAccess("/futprep/staff/payments");
  const { filter } = await searchParams;
  return <RequestsView access={access} filter={filter} />;
}
