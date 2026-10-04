import { RegistrationsList } from "@/app/_components/registrations/views";
import { listBusinessPrograms, listBusinessRegistrations } from "@/db/businessRegistrations";
import { requireDemo } from "@/lib/auth/demo";
import { DemoFrame } from "../DemoFrame";
import { DemoRequestPayment } from "./DemoRequestPayment";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registrations | Demo business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The demo's Registrations screen (brief 18, part B): the same screen a
// real business has, reading only the demo business. Classes can't be
// added or closed here (nothing a visitor types is kept).
export default async function DemoRegistrationsPage() {
  const { org } = await requireDemo();
  const [programs, registrations] = await Promise.all([listBusinessPrograms(org.id), listBusinessRegistrations(org.id)]);
  return (
    <DemoFrame crumbs={[{ label: "Registrations", href: "/demo/registrations" }]}>
      <RegistrationsList
        business={{ id: org.id, name: org.name, isPublished: false }}
        programs={programs}
        registrations={registrations}
        basePath="/demo/registrations"
        homeHref="/demo/home"
        homeLabel="Back to the demo business"
        registerHref={null}
        canEdit={false}
        requestPayment={(id) => <DemoRequestPayment registrationId={id} />}
      />
    </DemoFrame>
  );
}
