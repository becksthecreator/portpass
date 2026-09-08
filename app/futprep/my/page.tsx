import Link from "next/link";
import { LookupForm } from "./LookupForm";

export const metadata = {
  title: "Check registration status | Futprep",
  description: "Look up a Futprep registration by code and date of birth.",
};

export default function FutprepMyRegistrationPage() {
  return (
    <main className="futprep-theme my-status-page">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/futprep/lil-kickers">Program details</Link>
      </header>
      <section className="my-status-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Futprep · Registration status</div>
        <h1>Check on your registration.</h1>
        <p>Enter your registration code and your child&apos;s date of birth to see class details, payment status, and remaining sessions.</p>
      </section>
      <LookupForm />
    </main>
  );
}
