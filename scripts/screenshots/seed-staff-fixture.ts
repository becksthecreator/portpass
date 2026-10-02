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
  const { data: seededRegistrations, error: regError } = await db.from("registrations").insert(rows).select("id");
  if (regError || !seededRegistrations?.length) throw new Error(`Could not seed registrations: ${regError?.message}`);
  // Brief 08: Admin -> Bookings opens one registration, health details hidden.
  const registrationId = seededRegistrations[0].id;

  // Brief 13: coach pay. Two TEST coaches (the lead is tied to the
  // test-coach login, so that login sees only their own pay), who coached
  // the three Saturdays already played, one month partly paid.
  const { data: staffRows } = await db.from("staff_members").select("id,account_key").in("account_key", ["test-coach"]);
  const coachLoginId = staffRows?.[0]?.id ?? null;
  const { data: coaches, error: coachError } = await db
    .from("coach_profiles")
    .insert([
      // Public and bookable with no open times, so the coaches page shows the
      // "add your weekly slots" prompt on this coach's own card (brief 16, C1).
      { organization_id: org.id, slug: "test-delete-coach-bex", display_name: `${MARK} Coach Bex`, nickname: "Coach Bex", member_type: "coach", active: true, public_visible: true, bookable: true, default_lead_pay_cents: 5000, staff_member_id: coachLoginId },
      { organization_id: org.id, slug: "test-delete-coach-dre", display_name: `${MARK} Coach Dre`, member_type: "coach", active: true, public_visible: false, bookable: false, default_assistant_pay_cents: 2500 },
    ])
    .select("id,slug");
  if (coachError || !coaches) throw new Error(`Could not seed coaches: ${coachError?.message}`);
  const bex = coaches.find((c) => c.slug === "test-delete-coach-bex")!.id;
  const dre = coaches.find((c) => c.slug === "test-delete-coach-dre")!.id;
  await db.from("programs").update({ default_lead_coach_id: bex, field_cost_cents_per_term: 20000 }).eq("id", program.id);
  const { data: played } = await db.from("sessions").select("id,session_date").eq("term_id", term.id).lt("session_date", iso(nextSaturday)).order("session_date");
  const staffing = (played ?? []).flatMap((s, i) => [
    { session_id: s.id, coach_id: bex, role: "lead", pay_cents: 5000, paid_at: i === 0 ? now : null, created_by: MARK },
    { session_id: s.id, coach_id: dre, role: "assistant", pay_cents: 2500, paid_at: null, created_by: MARK },
  ]);
  if (staffing.length) {
    const { error: staffError } = await db.from("session_staff").insert(staffing);
    if (staffError) throw new Error(`Could not seed who coached: ${staffError.message}`);
  }
  // Two families paid: one of them brought in by PortPass (for the P&L).
  const { data: paidRegs } = await db.from("registrations").select("id,reference_code").eq("program_id", program.id).in("reference_code", ["FP-TEST-0001", "FP-TEST-0002"]);
  for (const reg of paidRegs ?? []) {
    await db.from("payments").insert({ registration_id: reg.id, amount_cents: 42000, method: "cash", status: "received", note: MARK, received_at: now });
    if (reg.reference_code === "FP-TEST-0001") await db.from("registrations").update({ commission_eligible: true }).eq("id", reg.id);
  }

  // Brief 05: the growth report. The TEST families registered before the
  // term began, one of them brought by PortPass; six children came to all
  // three Saturdays played, two came to none; and some views and taps of
  // the public pages, by source.
  await db.from("registrations").update({ submitted_at: new Date(`${iso(start)}T15:00:00Z`).toISOString() }).eq("program_id", program.id);
  await db.from("registrations").update({ is_new_family: true }).eq("program_id", program.id).eq("reference_code", "FP-TEST-0001");
  const { data: enrolled } = await db.from("registrations").select("id").eq("program_id", program.id).eq("registration_status", "confirmed").order("reference_code");
  const cameEveryWeek = (enrolled ?? []).slice(0, 6);
  const marks = (played ?? []).flatMap((s) => cameEveryWeek.map((r) => ({ registration_id: r.id, session_id: s.id, status: "present", marked_by: MARK })));
  if (marks.length) {
    const { error: markError } = await db.from("attendance").insert(marks);
    if (markError) throw new Error(`Could not seed attendance: ${markError.message}`);
  }
  const counted: Array<[string, string, number]> = [
    ["view", "qr", 46], ["view", "portpass_listing", 31], ["view", "instagram", 58], ["view", "unknown", 97],
    ["whatsapp_click", "qr", 5], ["whatsapp_click", "unknown", 9],
    ["register_click", "qr", 12], ["register_click", "instagram", 7], ["register_click", "unknown", 14],
    ["register_start", "qr", 8], ["register_start", "unknown", 11],
  ];
  const pageEvents = counted.flatMap(([event, source_channel, times]) => Array.from({ length: times }, () => ({ organization_id: org.id, path: "/sports-fitness/futprep-athletics", event, source_channel })));
  const { error: eventError } = await db.from("page_events").insert(pageEvents);
  if (eventError) throw new Error(`Could not seed page events: ${eventError.message}`);

  // Brief 08: one business waiting for review, one PortPass built for an
  // owner, and one suspended, so Admin -> Businesses shows each set of buttons.
  const stamp = new Date().toISOString();
  const { error: businessError } = await db.from("organizations").insert([
    { name: "TEST Padel Club (delete)", slug: "test-delete-padel-club", primary_category: "sports-fitness", status: "submitted", submitted_at: stamp, created_by_admin: false, created_at: stamp },
    { name: "TEST Party Rentals (delete)", slug: "test-delete-party-rentals", primary_category: "entertainment", status: "draft", created_by_admin: true, created_at: stamp },
    { name: "TEST Boat Tours (delete)", slug: "test-delete-boat-tours", primary_category: "tours", status: "suspended", created_by_admin: false, suspended_at: stamp, suspended_reason: "TEST reason", suspended_from: { status: "approved", is_published: false, is_directory_listed: false }, created_at: stamp },
  ]);
  if (businessError) throw new Error(`Could not seed businesses: ${businessError.message}`);

  // Brief 10: a live TEST business with three member perks, so the public
  // chips, the /perks page, the homepage row (shown from three) and the
  // business's own perk screen all have something to show.
  const { data: booth, error: boothError } = await db
    .from("organizations")
    .insert({ name: "TEST Photo Booth (delete)", slug: "test-delete-photo-booth", primary_category: "entertainment", status: "approved", one_liner: "TEST — delete. A photo booth, for screenshots only.", whatsapp_e164: "+12425550100", brand_color: "#7A3E9D", payment_methods: ["cash"], created_at: stamp })
    .select("id")
    .single();
  if (boothError || !booth) throw new Error(`Could not seed the TEST perk business: ${boothError?.message}`);
  const { error: boothOfferingError } = await db.from("offerings").insert({ organization_id: booth.id, type: "service", slug: "test-two-hour-booth", name: "TEST two-hour photo booth", summary: "TEST — delete.", price_cents: 30000, is_published: true });
  if (boothOfferingError) throw new Error(`Could not seed the TEST perk offering: ${boothOfferingError.message}`);
  const { error: boothLiveError } = await db.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", booth.id);
  if (boothLiveError) throw new Error(`Could not publish the TEST perk business: ${boothLiveError.message}`);
  const published = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const { error: perkError } = await db.from("member_perks").insert([
    { organization_id: booth.id, title: "TEST 10% off your first booking", kind: "percent_off", percent: 10, first_booking_only: true, ends_on: "2099-12-31", status: "live", published_at: published(1) },
    { organization_id: booth.id, title: "TEST free prints for every guest", kind: "free_addon", addon_text: "prints for every guest", status: "live", published_at: published(2) },
    { organization_id: booth.id, title: "TEST members book 48 hours early", kind: "early_access", early_access_hours: 48, status: "live", published_at: published(3) },
    { organization_id: booth.id, title: "TEST $20 off (not published yet)", kind: "amount_off", amount_cents: 2000, status: "draft", published_at: null },
  ].map((perk) => ({ percent: null, amount_cents: null, addon_text: null, early_access_hours: null, first_booking_only: false, ends_on: null, ...perk })));
  if (perkError) throw new Error(`Could not seed member perks: ${perkError.message}`);

  // Brief 14: a TEST platform owner (the workflow puts this address in
  // PLATFORM_OWNER_EMAILS for the run) and five TEST leads for Admin -> Leads.
  const adminEmail = "test-delete-admin@test.portpass.local";
  const { error: adminError } = await db.auth.admin.createUser({ email: adminEmail, email_confirm: true });
  if (adminError) throw new Error(`Could not seed the TEST admin: ${adminError.message}`);

  const reason = (key: string, label: string, points: number, why?: string) => ({ key, label, points, ...(why ? { why } : {}) });
  const leads = [
    {
      business_name: "TEST Party Rentals (delete)", section: "entertainment", area: "Nassau", island: "New Providence", what_they_do: "Tents, tables and chairs for hire",
      booking_method: "whatsapp_dm", prices_text: "Tents from $350", instagram_handle: "test_party_rentals", whatsapp_e164: "+12425550101", status: "new", source: "google_places", score: 85,
      score_reasons: [reason("books_by_dm", "Books by WhatsApp, DM or phone only", 25, "Bio says DM to book"), reason("publishes_prices", "Publishes prices", 15, "Caption: tents from $350"), reason("high_value", "High value ($300 or more)", 15), reason("posted_recently", "Posted in the last 30 days", 10), reason("real_demand", "Real demand", 10, "Caption: fully booked Saturday"), reason("section_we_fill", "A section we're filling", 10)],
      source_urls: ["https://maps.google.com/?cid=1", "https://www.instagram.com/test_party_rentals/"], google_rating: 4.7, google_rating_count: 37, next_step: "Call this week",
      draft_message: "Hi! I saw your tent setups in Nassau. How many times a day do you answer the same price question? I'm a founder of PortPass Bahamas. We'd build you a page with your prices, free to try for 30 days. Want to see it?",
    },
    {
      business_name: "TEST Swim School (delete)", section: "sports-fitness", area: "Cable Beach", island: "New Providence", what_they_do: "Children's swimming lessons",
      booking_method: "phone", whatsapp_e164: "+12425550102", status: "contacted", source: "founder", score: 60, warm_connection: true, last_contact_on: iso(new Date()), next_step: "Send the page preview",
      score_reasons: [reason("books_by_dm", "Books by WhatsApp, DM or phone only", 25), reason("publishes_prices", "Publishes prices", 15), reason("real_demand", "Real demand", 10), reason("warm_connection", "Warm connection", 10)],
    },
    {
      business_name: "TEST Beach Venue (delete)", section: "venues", area: "Love Beach", island: "New Providence", what_they_do: "Private beach for small events",
      booking_method: "instagram_dm", instagram_handle: "test_beach_venue", status: "replied", source: "inbound_form", score: 50, next_step: "Draft their page",
      score_reasons: [reason("books_by_dm", "Books by WhatsApp, DM or phone only", 25), reason("high_value", "High value ($300 or more)", 15), reason("limited_inventory", "Limited inventory", 10)],
    },
    {
      business_name: "TEST DJ Services (delete)", section: "entertainment", area: "Freeport", island: "Grand Bahama", what_they_do: "DJ and sound for weddings and parties",
      booking_method: "whatsapp_dm", status: "page_drafted", source: "referral", referral_code: "FUTPREP", score: 45, next_step: "Owner to check the draft",
      score_reasons: [reason("books_by_dm", "Books by WhatsApp, DM or phone only", 25), reason("posted_recently", "Posted in the last 30 days", 10), reason("section_we_fill", "A section we're filling", 10)],
    },
    {
      business_name: "TEST Boat Tours (delete)", section: "tours", area: "Exuma", island: "Exuma", what_they_do: "Half-day boat trips",
      booking_method: "website_booking", website_url: "https://testboattours.example/", status: "not_now", source: "tracker_import", priority: 3, score: 0, notes: "Already takes bookings on its own site.",
      score_reasons: [reason("publishes_prices", "Publishes prices", 15), reason("online_booking", "Already uses online booking", -30)],
    },
    // A bulk insert sends every column for every row, so the columns only
    // some leads set get their defaults here rather than null.
  ].map((lead) => ({ warm_connection: false, source_urls: [] as string[], ...lead, dedupe_key: lead.business_name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }));
  const { data: seededLeads, error: leadError } = await db.from("leads").insert(leads).select("id,business_name");
  if (leadError || !seededLeads) throw new Error(`Could not seed leads: ${leadError?.message}`);
  const leadId = seededLeads.find((l) => l.business_name.startsWith("TEST Party Rentals"))!.id;

  // Brief 08, build C: a few lines in the Messages log (test addresses,
  // never emailed), one server error and a backup that reported in.
  const { error: messageError } = await db.from("message_log").insert([
    { organization_id: org.id, template: "futprep_registration_received", recipient: "test-delete-parent-1@test.portpass.local", status: "delivered", detail: null },
    { organization_id: org.id, template: "futprep_payment_recorded", recipient: "test-delete-parent-2@test.portpass.local", status: "bounced", detail: "Bounced: Permanent." },
    { organization_id: org.id, template: "attendance_nudge", recipient: `${MARK} Coach Dre`, status: "skipped", detail: "No email address on this coach's staff account." },
    { organization_id: null, template: "business_approved", recipient: "test-delete-owner@test.portpass.local", status: "sent", detail: null },
  ]);
  if (messageError) throw new Error(`Could not seed the messages log: ${messageError.message}`);
  const { error: siteErrorError } = await db.from("site_errors").insert({ route: "/test-delete/[id]", route_type: "render", error_name: "TypeError", digest: "1234567890" });
  if (siteErrorError) throw new Error(`Could not seed a site error: ${siteErrorError.message}`);
  const { error: heartbeatError } = await db.from("site_content").upsert({ key: "backup_heartbeat", value: { at: new Date().toISOString(), ok: true } }, { onConflict: "key" });
  if (heartbeatError) throw new Error(`Could not seed the backup heartbeat: ${heartbeatError.message}`);

  // Brief 09: PortPass billing. A TEST account on this business with one
  // overdue invoice and one draft, and bank details so Send is allowed.
  const dayFromNow = (days: number) => new Date(Date.now() + days * 24 * 3600_000).toISOString().slice(0, 10);
  const { error: bankError } = await db.from("site_content").upsert({ key: "billing_bank", value: { bank: "TEST Bank", accountName: "PortPass Bahamas Technologies", accountNumber: "0000000", branch: "TEST Main" } }, { onConflict: "key" });
  if (bankError) throw new Error(`Could not seed the bank details: ${bankError.message}`);
  const { error: accountError } = await db.from("billing_accounts").upsert(
    { organization_id: org.id, plan_code: "growing", cycle: "monthly", price_cents: 12000, go_live_on: dayFromNow(-75), free_until: dayFromNow(-45), first_invoice_on: dayFromNow(-44), next_invoice_on: dayFromNow(17), status: "past_due", billing_email: "test-delete-billing@test.portpass.local", billing_whatsapp_e164: "+12425550100", agreement_signed_on: dayFromNow(-80), agreement_version: "TEST v1" },
    { onConflict: "organization_id" },
  );
  if (accountError) throw new Error(`Could not seed the billing account: ${accountError.message}`);
  const planLine = (label: string) => [{ description: `Growing plan, monthly: ${label}`, qty: 1, unit_cents: 12000, amount_cents: 12000, source: "plan" }];
  const overdue = await db.rpc("create_portpass_invoice", { p_organization_id: org.id, p_kind: "subscription", p_period_start: dayFromNow(-44), p_period_end: dayFromNow(-14), p_issued_on: dayFromNow(-44), p_due_on: dayFromNow(-30), p_lines: planLine("TEST first month"), p_status: "overdue" });
  const draft = await db.rpc("create_portpass_invoice", { p_organization_id: org.id, p_kind: "subscription", p_period_start: dayFromNow(-13), p_period_end: dayFromNow(16), p_issued_on: dayFromNow(0), p_due_on: dayFromNow(14), p_lines: planLine("TEST second month") });
  if (overdue.error || draft.error || !draft.data) throw new Error(`Could not seed the invoices: ${overdue.error?.message ?? draft.error?.message ?? "no draft"}`);

  // Brief 11: one of the five draft guides the migration adds, for its editor.
  const { data: guide, error: guideError } = await db.from("guides").select("id").eq("slug", "things-to-do-in-nassau-with-kids").single();
  if (guideError || !guide) throw new Error(`Could not find the seeded guide: ${guideError?.message ?? "none"}`);

  writeFileSync(out, JSON.stringify({ guideId: guide.id, billingOrgId: org.id, billingDraftId: Number(draft.data),  programId: program.id, termId: term.id, sessionId: session.id, sessionDate: session.session_date, adminEmail, leadId, registrationId }, null, 2));
  console.log(`Seeded TEST staff fixture: program ${program.id}, term ${term.id}, session ${session.id} on ${session.session_date}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
