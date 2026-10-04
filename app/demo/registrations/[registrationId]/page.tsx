import { notFound } from "next/navigation";
import { RegistrationDetail } from "@/app/_components/registrations/views";
import { getBusinessRegistration } from "@/db/businessRegistrations";
import { requireDemo } from "@/lib/auth/demo";
import { DemoFrame } from "../../DemoFrame";
import { DemoRequestPayment } from "../DemoRequestPayment";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registration | Demo business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// One of the demo's registrations. The health columns are never read here
// (mayViewHealth is false), and the demo holds none.
export default async function DemoRegistrationPage({ params }: { params: Promise<{ registrationId: string }> }) {
  const { org } = await requireDemo();
  const id = Number((await params).registrationId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const registration = await getBusinessRegistration(org.id, id, { mayViewHealth: false });
  if (!registration) notFound();

  return (
    <DemoFrame crumbs={[{ label: "Registrations", href: "/demo/registrations" }, { label: registration.reference, href: `/demo/registrations/${registration.id}` }]}>
      <RegistrationDetail
        registration={registration}
        listHref="/demo/registrations"
        actionsEndpoint={`/api/demo/registrations/${registration.id}`}
        requestPayment={<DemoRequestPayment registrationId={registration.id} button />}
        demo
      />
    </DemoFrame>
  );
}
