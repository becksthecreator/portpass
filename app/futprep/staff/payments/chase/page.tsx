import { ChaseView } from "@/app/_components/payments/views";
import { futprepPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chase list | Futprep staff", robots: { index: false, follow: false } };

export default async function FutprepPaymentsChasePage() {
  const access = await futprepPaymentsAccess("/futprep/staff/payments/chase");
  return <ChaseView access={access} />;
}
