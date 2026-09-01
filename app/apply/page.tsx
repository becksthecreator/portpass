import Link from "next/link";
import { ApplicationForm } from "./ApplicationForm";

export default function ApplyPage() {
  return (
    <main className="form-page">
      <header className="site-header form-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <Link className="header-link" href="/">Back home</Link>
      </header>
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />PortPass early access</div>
        <h1>Tell us about your organization.</h1>
        <p>We&apos;re welcoming the first group of Bahamian clubs, academies, and sports organizations.</p>
      </section>
      <ApplicationForm />
    </main>
  );
}
