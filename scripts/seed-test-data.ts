// Seeds the (local, ephemeral, Docker-based) integration-test database with
// a baseline fixture. This is meant to run exactly once, right after
// `supabase start` on a freshly-migrated, empty database - never against a
// real project. Because the tables are empty and their identity sequences
// haven't been touched, the first application/organization inserted here
// gets id=1, which matters because app/futprep/lil-kickers/staff-auth.ts
// still hardcodes FUTPREP_ORG_ID = 1 (the "single hardest dependency" the
// part-2 plan flags for stage 2.1 to remove) - until that's fixed, tests
// that exercise anything staff-auth-related need the seeded org to land on
// id 1.
// Deliberately does not import db/supabase.ts: it starts with
// `import "server-only"`, which throws unconditionally when loaded outside
// Next's own bundler (Next aliases it away at build time; a plain tsx
// script has no such alias). Constructing the client directly here is the
// simplest way around that for a script that only ever runs in CI/locally,
// never inside the app itself.
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set before running this script.");
  }
  const db = createClient(url, secretKey);
  const now = new Date().toISOString();

  const { data: application, error: applicationError } = await db
    .from("applications")
    .insert({
      organization_name: "Futprep Athletics",
      contact_person: "Test Fixture",
      email: "fixture@test.portpass.local",
      phone: "000-0000",
      activity_type: "Football",
      main_location: "Nassau, The Bahamas",
      player_count: "Pilot",
      help_needed: "Testing",
      description: "Seeded by scripts/seed-test-data.ts for integration tests.",
      status: "approved",
      submitted_at: now,
      reviewed_at: now,
    })
    .select("id")
    .single();
  if (applicationError) throw new Error(`Could not seed application: ${applicationError.message}`);

  const { data: organization, error: organizationError } = await db
    .from("organizations")
    .insert({
      application_id: application.id,
      name: "Futprep Athletics",
      primary_contact: "Test Fixture",
      email: "fixture@test.portpass.local",
      phone: "000-0000",
      activity_type: "Football",
      main_location: "Nassau, The Bahamas",
      slug: "futprep",
      registration_url: "/futprep/lil-kickers/register",
    })
    .select("id")
    .single();
  if (organizationError) throw new Error(`Could not seed organization: ${organizationError.message}`);

  const organizationId = organization.id;

  const programs: Array<{ slug: string; name: string; capacity: number; active: boolean }> = [
    { slug: "lil-kickers", name: "Futprep Lil Kickers", capacity: 20, active: true },
    { slug: "full-test-program", name: "Full Test Program", capacity: 1, active: true },
    { slug: "inactive-test-program", name: "Inactive Test Program", capacity: 20, active: false },
  ];

  for (const program of programs) {
    const { data: created, error: programError } = await db
      .from("programs")
      .insert({
        organization_id: organizationId,
        slug: program.slug,
        name: program.name,
        age_min: 3,
        age_max: 7,
        coed: true,
        location: "Lyford Cay Lower Campus Soccer Field",
        day_of_week: "Saturday",
        capacity: program.capacity,
        active: program.active,
        start_time: "9:00 AM",
      })
      .select("id")
      .single();
    if (programError) throw new Error(`Could not seed program ${program.slug}: ${programError.message}`);

    const { error: termError } = await db.from("program_terms").insert({
      program_id: created.id,
      name: "Term 1",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      break_dates: [],
      weekly_fee_cents: 3500,
      term_fee_cents: 30000,
      registration_fee_cents: 0,
      active: true,
    });
    if (termError) throw new Error(`Could not seed term for ${program.slug}: ${termError.message}`);
  }

  console.log(`Seeded test data: application ${application.id}, organization ${organizationId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
