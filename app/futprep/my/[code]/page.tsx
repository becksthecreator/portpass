import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { LookupForm } from "../LookupForm";

export const metadata = {
  title: "Check registration status | Futprep",
  description: "Look up a Futprep registration by code and date of birth.",
  // The address can carry a family's reference code: keep it out of search.
  robots: { index: false, follow: false },
};

export default async function FutprepMyRegistrationCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <main className="futprep-theme my-status-page">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <div className="registration-header-right">
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
          <Link className="header-link" href="/sports-fitness/futprep-athletics/lil-kickers">Program details</Link>
        </div>
      </header>
      <section className="my-status-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Futprep · Registration status</div>
        <h1>Check on your registration.</h1>
        <p>Confirm your child&apos;s date of birth to see class details, payment status, and remaining sessions.</p>
      </section>
      <LookupForm initialCode={decodeURIComponent(code)} />
    </main>
  );
}
