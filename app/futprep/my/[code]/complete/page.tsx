import Link from "next/link";
import { notFound } from "next/navigation";
import { getFutprepPendingRegistration } from "@/db/registrations";
import { CompleteRegistrationForm } from "./CompleteRegistrationForm";

// force-dynamic: reads the registration from the database at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const registration = await getFutprepPendingRegistration(decodeURIComponent(code));
  return { title: registration ? `Complete registration | ${registration.programName}` : "Complete registration | Futprep" };
}

export default async function CompleteRegistrationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const registration = await getFutprepPendingRegistration(decodeURIComponent(code));
  if (!registration) notFound();

  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
        </div>
      </header>
      <section className="registration-shell">
        <div className="registration-intro">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" />Futprep · Finish registration</div>
            <h1>Finish {registration.childName}&rsquo;s registration.</h1>
            <p>Futprep already has {registration.childName} down for <strong>{registration.programName}</strong>. A few more details and they&rsquo;re fully registered.</p>
          </div>
        </div>
        <CompleteRegistrationForm referenceCode={registration.referenceCode} childName={registration.childName} programName={registration.programName} />
      </section>
    </main>
  );
}
