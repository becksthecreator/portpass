// Seeds the TEST world for the coaches walk (brief 31, Part E;
// .github/workflows/coaches-walk.yml). Runs only against the throwaway
// local Supabase stack that job starts, after scripts/seed-test-data.ts:
// never against a real project. Every name is "TEST — delete", parents are
// @example.com (never emailed, lib/email.ts) with 242-555-01xx phones, and
// the whole database is thrown away when the job ends.
//
//   - Staff logins: a TEST coach, a TEST admin and the TEST owner (the CEO),
//     each with the one-run PIN from SCREENSHOT_PIN (masked by the workflow;
//     only a hash is stored).
//   - Two TEST coaches: Walker (tied to the coach login, with private-session
//     rates and no working days yet) and Other.
//   - A TEST field with a cost per hour that takes private sessions.
//   - A TEST Saturday class led by Walker: a two-Saturday term, the first on
//     or before today in Nassau, so start and end marks are both open today.
//     One TEST child on it, with photo permission yes.
//   - Two TEST private sessions for today: one asks for Walker, one for
//     Other (which Walker must never see).
//
// Writes the ids the walk needs to $SCREENSHOT_FIXTURE (JSON).
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../../lib/localStackOnly.mjs";

const MARK = "TEST — delete";

// Today's date in Nassau, as the app counts it (lib/futprepTerms.ts).
function nassauToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Nassau", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function saturdayOnOrBefore(iso: string): string {
  let day = iso;
  while (new Date(`${day}T12:00:00Z`).getUTCDay() !== 6) day = addDays(day, -1);
  return day;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const pin = process.env.SCREENSHOT_PIN;
  const out = process.env.SCREENSHOT_FIXTURE;
  if (!url || !key || !pin || !out) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, SCREENSHOT_PIN and SCREENSHOT_FIXTURE must be set.");
  assertLocalSupabase();
  const db = createClient(url, key);

  const { data: org, error: orgError } = await db.from("organizations").select("id").eq("slug", "futprep").single();
  if (orgError || !org) throw new Error(`Futprep organization missing: ${orgError?.message}`);
  const today = nassauToday();

  // Staff logins (app/futprep/staff-auth.ts reads organization id 1). The
  // old unsalted hash, as the staff screenshot fixture does: the first
  // sign-in upgrades it.
  const pinHash = createHash("sha256").update(pin).digest("hex");
  const { data: logins, error: loginError } = await db
    .from("staff_members")
    .insert([
      { organization_id: 1, account_key: "test-walk-coach", name: `${MARK} Coach Walker`, role: "coach", pin_hash: pinHash, responsibilities: "", active: true },
      { organization_id: 1, account_key: "test-walk-admin", name: `${MARK} Admin`, role: "admin", pin_hash: pinHash, responsibilities: "", active: true },
      { organization_id: 1, account_key: "test-walk-owner", name: `${MARK} Owner`, role: "ceo", pin_hash: pinHash, responsibilities: "", active: true },
    ])
    .select("id,account_key");
  if (loginError || !logins?.length) throw new Error(`Could not seed the TEST logins: ${loginError?.message}`);
  const coachLogin = logins.find((l) => l.account_key === "test-walk-coach")!.id;

  // Futprep sets its own rates: these are TEST amounts typed for this run.
  const { data: coaches, error: coachError } = await db
    .from("coach_profiles")
    .insert([
      { organization_id: org.id, slug: "test-delete-walk-coach", display_name: `${MARK} Coach Walker`, nickname: "Coach Walker", member_type: "coach", active: true, public_visible: true, bookable: true, working_days: [], private_30_pay_cents: 2000, private_60_pay_cents: 3500, default_lead_pay_cents: 5000, staff_member_id: coachLogin },
      { organization_id: org.id, slug: "test-delete-walk-other", display_name: `${MARK} Coach Other`, nickname: "Coach Other", member_type: "coach", active: true, public_visible: true, bookable: true, working_days: [2, 4], private_30_pay_cents: 2000, private_60_pay_cents: 3500, default_lead_pay_cents: 5000, staff_member_id: null },
    ])
    .select("id,slug");
  if (coachError || !coaches?.length) throw new Error(`Could not seed the TEST coaches: ${coachError?.message}`);
  const walker = coaches.find((c) => c.slug === "test-delete-walk-coach")!.id;
  const other = coaches.find((c) => c.slug === "test-delete-walk-other")!.id;

  const { data: field, error: fieldError } = await db
    .from("locations")
    .insert({ organization_id: org.id, name: `${MARK} walk field`, map_label: "TEST area", address: "TEST address", active: true, cost_model: "per_hour", cost_cents: 4000, surface: "grass", private_sessions_ok: true, days_available: [1, 2, 3, 4, 5, 6], hours_note: "TEST afternoons" })
    .select("id")
    .single();
  if (fieldError || !field) throw new Error(`Could not seed the TEST field: ${fieldError?.message}`);

  // The Saturday class: the term trigger makes its two Saturday sessions.
  const firstSaturday = saturdayOnOrBefore(today);
  const { data: program, error: programError } = await db
    .from("programs")
    .insert({
      organization_id: org.id, slug: "test-delete-walk-class", name: `${MARK} Walk Class`, program_type: "term", is_public: false,
      age_min: 5, age_max: 10, age_min_months: 60, age_max_months: 131, coed: true, location: "TEST walk field",
      day_of_week: "Saturday", start_time: "9:00 AM", end_time: "9:45 AM", capacity: 16, children_per_coach: 8, default_coaches: 1, active: true,
      default_lead_coach_id: walker, location_id: field.id,
    })
    .select("id")
    .single();
  if (programError || !program) throw new Error(`Could not seed the TEST class: ${programError?.message}`);
  const { data: term, error: termError } = await db
    .from("program_terms")
    .insert({ program_id: program.id, name: "TEST Walk Term", start_date: firstSaturday, end_date: addDays(firstSaturday, 7), weekly_fee_cents: 3500, term_fee_cents: 7000, active: true })
    .select("id")
    .single();
  if (termError || !term) throw new Error(`Could not seed the TEST term: ${termError?.message}`);
  const { data: sessionRows, error: sessionError } = await db.from("sessions").select("id,session_date").eq("term_id", term.id).order("session_date");
  const sessions = sessionRows ?? [];
  if (sessionError || sessions.length !== 2 || sessions[0].session_date !== firstSaturday) throw new Error(`The trigger did not make the two TEST Saturdays: ${sessionError?.message ?? JSON.stringify(sessions)}`);

  const now = new Date().toISOString();
  const childDob = "2018-05-01";
  const referenceCode = "FP-TEST-0031";
  const { data: registration, error: regError } = await db
    .from("registrations")
    .insert({
      reference_code: referenceCode, organization_id: org.id, program_id: program.id, term_id: term.id,
      parent_name: `${MARK} Walk Parent`, parent_email: "test-delete-walk-parent@example.com", parent_phone: "242-555-0131", relationship: "Parent",
      child_name: `${MARK} Walk Child`, child_dob: childDob, gender: "Prefer not to say",
      emergency_contact_name: `${MARK} Emergency`, emergency_contact_phone: "242-555-0132",
      // TEST markers, so the walk can prove they never reach the family's
      // page nor a coach without the medical view.
      allergies: "TEST-ALLERGY-MARKER", medical_conditions: "TEST-MEDICAL-MARKER", medications: "TEST-MEDICATION-MARKER", special_needs: "TEST-NEEDS-MARKER", authorized_pickup: `${MARK} Walk Parent`, additional_notes: "TEST-NOTES-MARKER",
      photo_consent: "yes", payment_frequency: "term", payment_method: "cash", amount_due_cents: 7000,
      registration_status: "confirmed", payment_status: "paid", consent_version: "test", consent_accepted: true, consent_at: now,
      signature_name: `${MARK} Walk Parent`, submitted_at: now, is_new_family: false, commission_eligible: false, commission_reason: "TEST fixture",
    })
    .select("id")
    .single();
  if (regError || !registration) throw new Error(`Could not seed the TEST child: ${regError?.message}`);

  // Two private sessions for today: Walker's and Other's.
  const request = (n: number, coach: number) => ({
    reference_code: `FP-S-WALK${n}`, organization_id: org.id, preferred_coach_id: coach, assigned_coach_id: null, request_type: "private_lesson",
    parent_name: `${MARK} Private Parent ${n}`, parent_email: `test-delete-walk-private-${n}@example.com`, parent_phone: `242-555-013${2 + n}`,
    child_name: `${MARK} Private Child ${n}`, child_age: 8, requested_date: today, requested_start_time: "16:00", duration_minutes: 60,
    location_preference: "", location_id: field.id, session_goal: "TEST first touch", notes: "", status: "pending", time_to_confirm: false,
  });
  const { data: requestRows, error: requestError } = await db.from("private_session_requests").insert([request(1, walker), request(2, other)]).select("id,reference_code");
  const requests = requestRows ?? [];
  if (requestError || requests.length !== 2) throw new Error(`Could not seed the TEST private sessions: ${requestError?.message}`);

  writeFileSync(out, JSON.stringify({
    today,
    walker,
    other,
    programId: program.id,
    sessionId: sessions[0].id,
    sessionDate: sessions[0].session_date,
    registrationId: registration.id,
    referenceCode,
    childDob,
    walkerRequestId: requests.find((r) => r.reference_code === "FP-S-WALK1")!.id,
    otherRequestId: requests.find((r) => r.reference_code === "FP-S-WALK2")!.id,
    dayAway: addDays(today, 10),
  }, null, 2));
  console.log(`Seeded the TEST coaches walk: class ${program.id}, session ${sessions[0].id} on ${sessions[0].session_date}, private sessions for ${today}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
