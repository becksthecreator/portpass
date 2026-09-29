import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { RegistrationForm } from "./RegistrationForm";
import { getFutprepAvailability } from "@/db/registrations";
import { ATTRIBUTION_COOKIE, attributionFromRequest, EMPTY_ATTRIBUTION, mergeAttribution, parseAttributionCookie, type Attribution } from "@/lib/attribution";
import { normalizeProgramSlug } from "../config";

// force-dynamic: the title/header badge below reads the selected program
// from the database, and this repo's CI build has no Supabase credentials
// available at build time. It also reads the attribution cookie.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ program?: string } & Record<string, string | string[] | undefined>>;

async function resolveProgram(searchParams: SearchParams) {
  const { program: slug } = await searchParams;
  if (!slug) return null;
  const normalized = normalizeProgramSlug(slug);
  const availability = await getFutprepAvailability();
  return availability.find((p) => p.slug === normalized) ?? null;
}

// Growth tracking (28 Sept): what the 30-day first-party cookie remembers
// (set by middleware on every Futprep page), merged with anything this
// very request carries -- a parent who lands straight on the form from a
// tagged link has no cookie yet. Passed to the form as hidden values; the
// server decides what it proves.
async function readAttribution(searchParams: SearchParams): Promise<Attribution> {
  const [params, cookieStore, headerStore] = await Promise.all([searchParams, cookies(), headers()]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const incoming = attributionFromRequest({ searchParams: query, referer: headerStore.get("referer"), ownHost: headerStore.get("host") });
  return mergeAttribution(parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value), incoming) ?? EMPTY_ATTRIBUTION;
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
  const [program, attribution] = await Promise.all([resolveProgram(searchParams), readAttribution(searchParams)]);
  const programDetailsHref = program ? `/sports-fitness/futprep-athletics/${program.slug}` : "/sports-fitness/futprep-athletics";

  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>{program ? program.name.toUpperCase() : "FUTPREP ATHLETICS"}</b><small>by Futprep Athletics</small></span></div>
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
          <Link className="header-link" href={programDetailsHref}>Program details</Link>
        </div>
      </header>
      <Suspense fallback={null}>
        <RegistrationForm attribution={attribution} />
      </Suspense>
    </main>
  );
}
