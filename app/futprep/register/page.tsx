import Link from "next/link";
import { Suspense } from "react";
import { RegistrationForm } from "./RegistrationForm";
import { getFutprepAvailability } from "@/db/registrations";
import { normalizeProgramSlug } from "../config";

// force-dynamic: the title/header badge below reads the selected program
// from the database, and this repo's CI build has no Supabase credentials
// available at build time.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ program?: string }>;

async function resolveProgram(searchParams: SearchParams) {
  const { program: slug } = await searchParams;
  if (!slug) return null;
  const normalized = normalizeProgramSlug(slug);
  const availability = await getFutprepAvailability();
  return availability.find((p) => p.slug === normalized) ?? null;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const program = await resolveProgram(searchParams);
  return {
    title: program ? `Register | ${program.name}` : "Register | Futprep Athletics",
    description: program
      ? `Register a child for ${program.name} Term 1.`
      : "Register a child for a Futprep Athletics Term 1 program.",
  };
}

export default async function FutprepRegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const program = await resolveProgram(searchParams);
  const programDetailsHref = program ? `/futprep/${program.slug}` : "/futprep/programs";

  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>{program ? program.name.toUpperCase() : "FUTPREP ATHLETICS"}</b><small>by Futprep Athletics</small></span></div>
          <Link className="header-link" href="/futprep">Futprep home</Link>
          <Link className="header-link" href={programDetailsHref}>Program details</Link>
        </div>
      </header>
      <Suspense fallback={null}>
        <RegistrationForm />
      </Suspense>
    </main>
  );
}
