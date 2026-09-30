// Seeds TEST data for the staff screenshot job (.github/workflows/
// staff-screenshots.yml). Runs only against the throwaway local Supabase
// stack that job starts, after scripts/seed-test-data.ts -- never against
// a real project. Every name is "TEST — delete".
//
// The staff PIN comes from the SCREENSHOT_PIN environment variable, which
// the workflow generates at random for this one run and masks in the logs.
// Only its SHA-256 hash is stored, exactly as app/futprep/staff-auth.ts
// stores a real PIN.
//
// Writes the ids the capture script needs to $SCREENSHOT_FIXTURE (JSON).
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MARK = "TEST — delete";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function saturdayOnOrAfter(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const pin = process.env.SCREENSHOT_PIN;
  const out = process.env.SCREENSHOT_FIXTURE;
  if (!url || !key || !pin || !out) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, SCREENSHOT_PIN and SCREENSHOT_FIXTURE must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");
  const db = createClient(url, key);

  const { data: org, error: orgError } = await db.from("organizations").select("id").eq("slug", "futprep").single();
  if (orgError || !org) throw new Error(`Futprep organization missing: ${orgError?.message}`);

  // Staff accounts: a CEO (sees everything) and a coach.
  const pinHash = createHash("sha256").update(pin).digest("hex");
  const accounts = [
    { account_key: "test-ceo", name: `${MARK} Coach Alex`, role: "ceo" },
    { account_key: "test-coach", name: `${MARK} Coach Bex`, role: "coach" },
  ];
  for (const account of accounts) {
    // app/futprep/staff-auth.ts still reads staff accounts from organization
    // id 1 (FUTPREP_ORG_ID), whichever organisation that is locally.
    const { error } = await db.from("staff_members").insert({ organization_id: 1, ...account, pin_hash: pinHash, responsibilities: "", active: true });
    if (error) throw new Error(`Could not seed staff account: ${error.message}`);
  }

  // A Saturday class with a term around today: 20 places, 8 children per
  // coach, one coach by default (so a cap of 8).
  const nextSaturday = saturdayOnOrAfter(new Date());
  const start = new Date(nextSaturday);
  start.setUTCDate(start.getUTCDate() - 21);
  const end = new Date(nextSaturday);
  end.setUTCDate(end.getUTCDate() + 63);

  const { data: program, error: programError } = await db
    .from("programs")
    .insert({
      organization_id: org.id, slug: "test-delete-kickers", name: `${MARK} Kickers`, program_type: "term", is_public: false,
      age_min: 3, age_max: 6, age_min_months: 36, age_max_months: 83, coed: true, location: "TEST field",
      day_of_week: "Saturday", start_time: "10:00 AM", end_time: "10:45 AM", capacity: 20, children_per_coach: 8, default_coaches: 1, active: true,
    })
    .select("id")
    .single();
  if (programError || !program) throw new Error(`Could not seed program: ${programError?.message}`);

  const { data: term, error: termError } = await db
    .from("program_terms")
    .insert({ program_id: program.id, name: "TEST Term", start_date: iso(start), end_date: iso(end), weekly_fee_cents: 4500, term_fee_cents: 42000, active: true })
    .select("id")
    .single();
  if (termError || !term) throw new Error(`Could not seed term: ${termError?.message}`);

  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("id,session_date")
    .eq("term_id", term.id)
    .eq("session_date", iso(nextSaturday))
    .single();
  if (sessionError || !session) throw new Error(`The trigger did not create the session: ${sessionError?.message}`);

  // Eleven TEST children: more than one coach allows.
  const now = new Date().toISOString();
  const rows = Array.from({ length: 11 }, (_, i) => ({
    reference_code: `FP-TEST-${String(i + 1).padStart(4, "0")}`,
    organization_id: org.id,
    program_id: program.id,
    term_id: term.id,
    parent_name: `${MARK} Parent ${i + 1}`,
    parent_email: `test-delete-parent-${i + 1}@test.portpass.local`,
    parent_phone: `+124255500${String(i + 10)}`,
    relationship: "Parent",
    child_name: `${MARK} Child ${String.fromCharCode(65 + i)}`,
    child_dob: "2022-03-01",
    gender: "Prefer not to say",
    emergency_contact_name: `${MARK} Emergency`,
    emergency_contact_phone: "+12425550199",
    allergies: "",
    medical_conditions: "",
    medications: "",
    special_needs: "",
    authorized_pickup: `${MARK} Parent ${i + 1}`,
    additional_notes: "",
    photo_consent: "no",
    payment_frequency: "term",
    payment_method: "cash",
    amount_due_cents: 42000,
    registration_status: i < 8 ? "confirmed" : "pending",
    payment_status: i < 5 ? "paid" : "pending",
    consent_version: "test",
    consent_accepted: true,
    consent_at: now,
    signature_name: `${MARK} Parent ${i + 1}`,
    submitted_at: now,
    is_new_family: false,
    commission_eligible: false,
    commission_reason: "TEST fixture",
  }));
  const { error: regError } = await db.from("registrations").insert(rows);
  if (regError) throw new Error(`Could not seed registrations: ${regError.message}`);

  writeFileSync(out, JSON.stringify({ programId: program.id, termId: term.id, sessionId: session.id, sessionDate: session.session_date }, null, 2));
  console.log(`Seeded TEST staff fixture: program ${program.id}, term ${term.id}, session ${session.id} on ${session.session_date}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
