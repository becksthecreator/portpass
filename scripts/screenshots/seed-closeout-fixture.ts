// Seeds a TEST business with priced offerings and TEST booking requests for
// the Phase 1 close-out screenshot job
// (.github/workflows/closeout-screenshots.yml, brief 19). Runs only against
// the throwaway local Supabase stack that job starts -- never against a
// real project. Every name is TEST; no real customer, phone number or bank
// account. Nothing is sent anywhere.
//
// Writes what the capture script needs to $SCREENSHOT_FIXTURE (JSON).
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const nassauDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const token = () => randomBytes(20).toString("hex");

type Seed = {
  key: string;
  offering: string;
  customer: string;
  phone: string;
  email: string;
  date: number;
  time: string | null;
  qty: string;
  where: string;
  notes: string;
  child?: string;
  status: "new" | "confirmed" | "done" | "declined" | "cancelled";
  reason?: string;
  askedHoursAgo: number;
  // A payment request made from the booking, and whether it has been sent.
  payment?: "draft" | "sent";
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = process.env.SCREENSHOT_FIXTURE;
  if (!url || !key || !out) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY and SCREENSHOT_FIXTURE must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");
  const db = createClient(url, key);

  const ownerEmail = "test-delete-booth-owner@test.portpass.local";
  const { data: created, error: userError } = await db.auth.admin.createUser({ email: ownerEmail, email_confirm: true });
  if (userError || !created.user) throw new Error(`Could not seed the TEST owner: ${userError?.message}`);
  const ownerId = created.user.id;
  await db.from("profiles").upsert({ user_id: ownerId, full_name: "TEST Owner" });

  const slug = "test-island-booth";
  const category = "entertainment";
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name: "TEST Island Booth",
      slug,
      primary_category: category,
      status: "approved",
      one_liner: "TEST — delete. Photo booths and party hire, for screenshots only.",
      description: "TEST — delete. A made-up business used to photograph PortPass's booking screens.",
      area: "Nassau",
      island: "New Providence",
      whatsapp_e164: "+12425550100",
      phone_e164: "+12425550100",
      public_email: "test-delete-booth@test.portpass.local",
      brand_color: "#B4124A",
      // A photo that ships with the site, so the page's hero is drawn as a
      // real, resized image (brief 19, part C).
      hero_image_url: "/weddings/bahamas-by-the-sea/hero.jpg",
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST business: ${orgError?.message}`);
  const orgId = Number(org.id);
  await db.from("organization_members").insert({ organization_id: orgId, user_id: ownerId, role: "org_owner" });

  const offering = (offeringSlug: string, name: string, extra: Record<string, unknown>) => ({ organization_id: orgId, type: "service", slug: offeringSlug, name, is_published: true, summary: null, price_unit: null, age_min: null, age_max: null, lead_time_text: null, sort_order: 0, is_featured: false, ...extra });
  const { data: offerings, error: offeringError } = await db
    .from("offerings")
    .insert([
      offering("photo-booth", "TEST Photo booth hire", { price_cents: 15000, price_unit: "per_hour", summary: "Open-air booth, props and unlimited prints.", lead_time_text: "Book at least a week ahead", sort_order: 1, is_featured: true }),
      offering("kids-party", "TEST Kids' party package", { price_cents: 2500, price_unit: "per_child", summary: "Games, music and a host for two hours.", age_min: 4, age_max: 12, sort_order: 2 }),
      offering("dj-set", "TEST DJ set", { price_cents: 30000, price_unit: "from", summary: "Four hours, with sound and lights.", sort_order: 3 }),
    ])
    .select("id,slug,name,price_cents,price_unit");
  if (offeringError || !offerings) throw new Error(`Could not seed the TEST offerings: ${offeringError?.message}`);
  const live = await db.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", orgId);
  if (live.error) throw new Error(`Could not publish the TEST business: ${live.error.message}`);

  const { error: settingsError } = await db.from("organization_payment_settings").insert({
    organization_id: orgId,
    reference_prefix: "TIB",
    accepted_methods: ["cash", "bank_transfer"],
    bank_name: "TEST Bank of Nassau",
    account_name: "TEST Island Booth",
    account_number_last4: "0042",
    transfer_instructions: "TEST — Transit 00000, account 000-TEST-0042.\nPut your reference in the transfer note.",
    cash_note: "TEST — On the day, before set-up",
    default_due_days: 7,
  });
  if (settingsError) throw new Error(`Could not seed the payment settings: ${settingsError.message}`);

  const seeds: Seed[] = [
    { key: "new1", offering: "photo-booth", customer: "TEST Dana Rolle", phone: "+12425550101", email: "test-delete-dana@test.portpass.local", date: 12, time: "18:00", qty: "3 hours", where: "TEST — Sandyport Beach Club", notes: "TEST — delete. A 40th birthday, about 60 guests.\nIs set-up before 5 pm possible?", status: "new", askedHoursAgo: 3 },
    { key: "new2", offering: "kids-party", customer: "TEST Andre Ferguson", phone: "+12425550102", email: "test-delete-andre@test.portpass.local", date: 19, time: "14:00", qty: "10 children", where: "TEST — at home, Cable Beach", notes: "", child: "Maya", status: "new", askedHoursAgo: 20 },
    { key: "confirmed", offering: "photo-booth", customer: "TEST Keisha Knowles", phone: "+12425550103", email: "test-delete-keisha@test.portpass.local", date: 5, time: "19:30", qty: "2 hours", where: "TEST — Old Fort Bay Club", notes: "TEST — delete. Wedding reception.", status: "confirmed", askedHoursAgo: 50, payment: "sent" },
    { key: "confirmed2", offering: "dj-set", customer: "TEST Marcus Bethel", phone: "+12425550104", email: "test-delete-marcus@test.portpass.local", date: 26, time: "20:00", qty: "", where: "TEST — Paradise Island", notes: "", status: "confirmed", askedHoursAgo: 70 },
    { key: "done", offering: "dj-set", customer: "TEST Lena Moss", phone: "+12425550105", email: "test-delete-lena@test.portpass.local", date: 1, time: "20:00", qty: "", where: "TEST — Lyford Cay", notes: "", status: "done", askedHoursAgo: 300 },
    { key: "declined", offering: "photo-booth", customer: "TEST Chris Sands", phone: "+12425550106", email: "test-delete-chris@test.portpass.local", date: 2, time: "12:00", qty: "4 hours", where: "TEST — Eleuthera", notes: "", status: "declined", reason: "TEST — we don't travel to the Family Islands yet. Sorry!", askedHoursAgo: 90 },
    { key: "cancelled", offering: "kids-party", customer: "TEST Joy Strachan", phone: "+12425550107", email: "test-delete-joy@test.portpass.local", date: 9, time: null, qty: "6 children", where: "", notes: "", child: "Noah", status: "cancelled", askedHoursAgo: 40 },
  ];

  const fixture: Record<string, unknown> = { ownerEmail, slug, category, orgId };
  for (const s of seeds) {
    const chosen = offerings.find((o) => o.slug === s.offering)!;
    const publicToken = token();
    const { data: row, error } = await db.rpc("booking_request_create", {
      p: {
        organization_id: orgId,
        default_prefix: "TIB",
        offering_id: chosen.id,
        offering_name: chosen.name,
        public_token: publicToken,
        customer_name: s.customer,
        customer_email: s.email,
        customer_phone: s.phone,
        guardian_confirmed: Boolean(s.child),
        child_first_name: s.child ?? null,
        requested_date: nassauDay(s.date),
        requested_time: s.time,
        duration_or_qty: s.qty,
        location_text: s.where,
        notes: s.notes,
        price_cents: chosen.price_cents,
        price_unit: chosen.price_unit,
        source: "portpass_listing",
      },
    });
    if (error || !row) throw new Error(`Could not seed booking ${s.key}: ${error?.message}`);
    const id = Number((row as { id: number }).id);
    const reference = String((row as { reference_code: string }).reference_code);
    const update: Record<string, unknown> = { created_at: hoursAgo(s.askedHoursAgo) };
    if (s.status !== "new") Object.assign(update, { status: s.status });
    if (s.status === "confirmed" || s.status === "done") Object.assign(update, { confirmed_at: hoursAgo(s.askedHoursAgo - 2), handled_by_name: "TEST Owner" });
    if (s.status === "done") Object.assign(update, { done_at: hoursAgo(1) });
    if (s.status === "declined") Object.assign(update, { declined_at: hoursAgo(s.askedHoursAgo - 1), declined_reason: s.reason, handled_by_name: "TEST Owner" });
    if (s.status === "cancelled") Object.assign(update, { cancelled_at: hoursAgo(s.askedHoursAgo - 1) });

    if (s.payment) {
      const qty = Number.parseInt(s.qty, 10) || 1;
      const lines = [{ label: `${chosen.name} (${reference})`, qty, unit_cents: Number(chosen.price_cents) }];
      const payToken = token();
      const { data: request, error: requestError } = await db.rpc("payment_request_create", {
        p: { organization_id: orgId, default_prefix: "TIB", public_token: payToken, customer_name: s.customer, customer_phone: s.phone, customer_email: s.email, offering_id: chosen.id, line_items: lines, total_cents: qty * Number(chosen.price_cents), due_date: nassauDay(3), allow_part_payment: false, methods_allowed: ["bank_transfer", "cash"], created_by: ownerId, created_by_name: "TEST Owner" },
      });
      if (requestError || !request) throw new Error(`Could not seed the payment request for ${s.key}: ${requestError?.message}`);
      const requestId = Number((request as { id: number }).id);
      if (s.payment === "sent") {
        const { error: sentError } = await db.from("payment_requests").update({ sent_at: hoursAgo(4), sent_via: "email" }).eq("id", requestId);
        if (sentError) throw new Error(`Could not mark the payment request sent: ${sentError.message}`);
      }
      Object.assign(update, { payment_request_id: requestId });
    }
    const { error: updateError } = await db.from("booking_requests").update(update).eq("id", id);
    if (updateError) throw new Error(`Could not update booking ${s.key}: ${updateError.message}`);
    fixture[s.key] = { id, token: publicToken, reference };
  }

  writeFileSync(out, JSON.stringify(fixture));
  console.log(`Seeded TEST booking requests for ${slug} (org ${orgId}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
