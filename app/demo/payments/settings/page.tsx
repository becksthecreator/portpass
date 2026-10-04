import { SettingsView } from "@/app/_components/payments/views";
import { requireDemo } from "@/lib/auth/demo";
import { demoPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "How customers pay | Demo business | PortPass Bahamas", robots: { index: false, follow: false } };

// Read only in the demo: how a business is paid can't be changed here.
export default async function DemoPaymentsSettingsPage() {
  const { org } = await requireDemo();
  return <SettingsView access={demoPaymentsAccess(org)} />;
}
