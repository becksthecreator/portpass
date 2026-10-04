import { ChaseView } from "@/app/_components/payments/views";
import { requireDemo } from "@/lib/auth/demo";
import { demoPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chase list | Demo business | PortPass Bahamas", robots: { index: false, follow: false } };

export default async function DemoPaymentsChasePage() {
  const { org } = await requireDemo();
  return <ChaseView access={demoPaymentsAccess(org)} />;
}
