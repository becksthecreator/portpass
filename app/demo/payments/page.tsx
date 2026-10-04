import { RequestsView } from "@/app/_components/payments/views";
import { requireDemo } from "@/lib/auth/demo";
import { demoPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment requests | Demo business | PortPass Bahamas", robots: { index: false, follow: false } };

// The demo's payment requests (brief 18, part B): the same screens a real
// business has, through the demo door, reading only the demo business.
export default async function DemoPaymentsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { org } = await requireDemo();
  const { filter } = await searchParams;
  return <RequestsView access={demoPaymentsAccess(org)} filter={filter} />;
}
