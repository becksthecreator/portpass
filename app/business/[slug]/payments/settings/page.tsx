import { SettingsView } from "@/app/_components/payments/views";
import { requireOrgRole } from "@/lib/auth/guards";
import { businessPaymentsAccess } from "@/lib/paymentRequests/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment settings | PortPass Bahamas", robots: { index: false, follow: false } };

export default async function BusinessPaymentSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await businessPaymentsAccess(await requireOrgRole({ slug }, "org_staff", `/business/${slug}/payments/settings`));
  return <SettingsView access={access} />;
}
