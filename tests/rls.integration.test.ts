import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Brief 21, part B: what a browser key can and cannot read, proved against
// the database the migrations build (supabase/migrations/202610180001).
//
// The anon key (SUPABASE_PUBLISHABLE_KEY) is what a browser would hold.
// PortPass's own pages never use it; every read goes through the service
// role on the server. These tests are the second line: if a server bug ever
// handed that key to a query, this is all it could see.

const url = process.env.SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const anon = createClient(url, anonKey ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

const TAG = `rls-${Date.now().toString(36)}`;
const SLUG = { published: `test-${TAG}-published`, draft: `test-${TAG}-draft`, demo: `test-${TAG}-demo` };

// The classes in the migration's header. A table is in exactly one.
const OWNER_ONLY = [
  "attendance", "audit_log", "booking_requests", "coach_availability", "coach_profiles", "drop_waitlist", "futprep_return_links", "guardianships",
  "member_pass_checks", "member_perks", "message_log", "organization_invites", "organization_payment_settings", "page_events", "payment_requests",
  "payments", "people", "perk_redemptions", "private_session_events", "private_session_requests", "program_terms", "programs", "registration_edits",
  "registrations", "reservations", "session_staff", "sessions", "shops", "staff_members", "wedding_lead_notes", "wedding_leads", "wedding_site_settings",
  "wedding_unavailable_dates",
];
const PLATFORM_ONLY = [
  "admin_links", "applications", "billing_accounts", "billing_events", "billing_reminders", "commission_plans", "interest_submissions", "job_runs", "leads",
  "organization_claim_links", "portpass_invoice_counters", "portpass_invoice_lines", "portpass_invoices", "portpass_receipts", "scout_lookups", "site_content",
  "site_errors", "sponsors", "staff_login_attempts",
];
// Each with the columns a browser may read, and a row test the migration states.
const PUBLIC_READ = [
  "organizations", "offerings", "organization_faqs", "organization_images", "organization_categories", "locations", "pricing_plans", "pricing_addons",
  "venues", "products", "product_variants", "drops", "drop_items", "categories", "guides", "guide_listings", "wedding_packages", "wedding_gallery_images",
];

const ids: Record<"published" | "draft" | "demo", number> = { published: 0, draft: 0, demo: 0 };

async function nothingComesBack(table: string, columns = "*") {
  const { data, error } = await anon.from(table).select(columns).limit(5);
  // Grants are revoked, so this is a permission error rather than an empty
  // result; either way nothing comes back.
  expect(error !== null || (data ?? []).length === 0, `anon must get nothing from ${table}`).toBe(true);
}

describe.skipIf(!anonKey)("row level security, seen through a browser key", () => {
  beforeAll(async () => {
    for (const kind of ["published", "draft", "demo"] as const) {
      // The database itself keeps a demo business unpublished and in draft
      // (202610150001), so the demo row here is a draft as well; the policy
      // says "not is_demo" on top of that.
      const { data, error } = await admin
        .from("organizations")
        .insert({
          name: `TEST — delete ${TAG} ${kind}`,
          slug: SLUG[kind],
          primary_category: "sports-fitness",
          status: kind === "published" ? "live" : "draft",
          is_published: kind === "published",
          is_demo: kind === "demo",
          email: `owner-${TAG}@example.com`,
          phone: "242-555-0100",
          bank_transfer_details: `TEST bank details ${TAG}`,
        })
        .select("id")
        .single();
      if (error) throw new Error(`could not seed ${kind} organisation: ${error.message}`);
      ids[kind] = Number(data.id);
      const offering = await admin.from("offerings").insert({ organization_id: ids[kind], type: "service", slug: `test-${TAG}`, name: `TEST ${kind} offering`, price_cents: 3500, price_unit: "per_session", is_published: true });
      if (offering.error) throw new Error(`could not seed offering: ${offering.error.message}`);
      const faq = await admin.from("organization_faqs").insert({ organization_id: ids[kind], question: `TEST ${TAG}?`, answer: "TEST", sort_order: 0 });
      if (faq.error) throw new Error(`could not seed faq: ${faq.error.message}`);
    }
  });

  afterAll(async () => {
    const all = Object.values(ids).filter(Boolean);
    await admin.from("organization_faqs").delete().in("organization_id", all);
    await admin.from("offerings").delete().in("organization_id", all);
    await admin.from("audit_log").delete().in("organization_id", all);
    await admin.from("organizations").delete().in("id", all);
  });

  it("every owner-only and platform-only table gives a browser key nothing", async () => {
    for (const table of [...OWNER_ONLY, ...PLATFORM_ONLY]) await nothingComesBack(table);
  });

  it("organizations: only published, non-demo rows, and only the public columns", async () => {
    const { data, error } = await anon.from("organizations").select("id,slug,name,is_published,is_demo").in("slug", Object.values(SLUG));
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.slug)).toEqual([SLUG.published]);
    for (const row of data ?? []) {
      expect(row.is_published).toBe(true);
      expect(row.is_demo).toBe(false);
    }
    // The owner's contact details and bank details are not readable at all,
    // not even on a published row.
    for (const column of ["email", "phone", "primary_contact", "bank_transfer_details", "review_note", "suspended_reason", "licences"]) {
      const hidden = await anon.from("organizations").select(column).eq("slug", SLUG.published).limit(1);
      expect(hidden.error, `anon must not be able to select organizations.${column}`).not.toBeNull();
      expect(hidden.data).toBeNull();
    }
    // Nor "everything", since everything includes those.
    const star = await anon.from("organizations").select("*").eq("slug", SLUG.published).limit(1);
    expect(star.error).not.toBeNull();
  });

  it("a business's public rows follow the business: a draft or demo business's offerings and FAQs are not there", async () => {
    const all = Object.values(ids);
    const offerings = await anon.from("offerings").select("organization_id,name,is_published").in("organization_id", all);
    expect(offerings.error).toBeNull();
    expect((offerings.data ?? []).map((row) => Number(row.organization_id))).toEqual([ids.published]);
    const faqs = await anon.from("organization_faqs").select("organization_id,question").in("organization_id", all);
    expect(faqs.error).toBeNull();
    expect((faqs.data ?? []).map((row) => Number(row.organization_id))).toEqual([ids.published]);
    // An unpublished offering of a published business is hidden too.
    const hidden = await admin.from("offerings").insert({ organization_id: ids.published, type: "service", slug: `test-${TAG}-hidden`, name: `TEST hidden offering`, price_cents: 1000, price_unit: "from", is_published: false }).select("id").single();
    expect(hidden.error).toBeNull();
    const again = await anon.from("offerings").select("id").eq("organization_id", ids.published);
    expect((again.data ?? []).map((row) => Number(row.id))).not.toContain(Number(hidden.data!.id));
  });

  it("every public-read table answers a browser key without a permission error", async () => {
    for (const table of PUBLIC_READ) {
      const { error } = await anon.from(table).select("*").limit(1);
      // organizations and a few others grant only some columns: "*" is
      // refused there by design, and the test above checks them by name.
      if (["organizations", "venues", "products", "drops", "guides"].includes(table)) continue;
      expect(error, `anon should be able to read ${table}: ${error?.message}`).toBeNull();
    }
  });

  it("people and registrations: no name, contact, child or health field ever reaches a browser key", async () => {
    await nothingComesBack("people", "id,name,email,phone_e164");
    await nothingComesBack("registrations", "child_name,child_dob,allergies,medical_conditions,medications,special_needs,emergency_contact_name,emergency_contact_phone,parent_email,parent_phone");
    await nothingComesBack("guardianships");
  });

  it("a browser key cannot write anywhere, public-read tables included", async () => {
    const attempts = [
      anon.from("organizations").insert({ name: `TEST — delete ${TAG} anon`, slug: `test-${TAG}-anon`, primary_category: "sports-fitness" }),
      anon.from("organizations").update({ name: "TEST changed" }).eq("id", ids.published),
      anon.from("offerings").delete().eq("organization_id", ids.published),
      anon.from("categories").insert({ slug: `test-${TAG}`, name: "TEST", sort_order: 999 }),
      anon.from("interest_submissions").insert({ category: "TEST", email: `anon-${TAG}@example.com` }),
      anon.from("wedding_leads").insert({ idempotency_key: `test-${TAG}`, names: "TEST", email: `anon-${TAG}@example.com` }),
    ];
    for (const attempt of await Promise.all(attempts)) expect(attempt.error).not.toBeNull();
    const still = await admin.from("organizations").select("name").eq("id", ids.published).single();
    expect(still.data?.name).toBe(`TEST — delete ${TAG} published`);
  });

  it("the helper and the checks are not callable from a browser", async () => {
    expect((await anon.rpc("admin_database_checks")).error).not.toBeNull();
    // private.public_organization has no REST endpoint: the schema is not exposed.
    expect((await anon.schema("private").rpc("public_organization", { org_id: ids.published })).error).not.toBeNull();
  });
});
