import { SettingsView } from "@/app/_components/payments/views";
import { futprepPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment settings | Futprep staff", robots: { index: false, follow: false } };

export default async function FutprepPaymentSettingsPage() {
  const access = await futprepPaymentsAccess("/futprep/staff/payments/settings");
  return <SettingsView access={access} />;
}
