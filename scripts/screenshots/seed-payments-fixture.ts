// Seeds a TEST business with TEST payment requests for the payments
// screenshot job (.github/workflows/payments-screenshots.yml, brief 17).
// Runs only against the throwaway local Supabase stack that job starts --
// never against a real project. Every name is TEST; no real customer,
// phone number or bank account. Nothing is sent anywhere.
//
// Writes what the capture script needs to $SCREENSHOT_FIXTURE (JSON).
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const nassauDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const token = () => randomBytes(20).toString("hex");

type Line = { label: string; qty: number; unit_cents: number };
type Seed = {
  key: string;
  customer: string;
  phone: string | null;
  email: string | null;
  lines: Line[];
  due: number;
  part?: boolean;
  methods?: string[];
  sent?: "whatsapp_link" | "email" | "in_person" | "link" | null;
  paid?: { cents: number; method: string; reference?: string }[];
  remindedHoursAgo?: number;
  saysPaid?: string;
  voided?: string;
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = process.env.SCREENSHOT_FIXTURE;
  if (!url || !key || !out) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY and SCREENSHOT_FIXTURE must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");
  const db = createClient(url, key);

  const ownerEmail = "test-delete-pay-owner@test.portpass.local";
  const { data: created, error: userError } = await db.auth.admin.createUser({ email: ownerEmail, email_confirm: true });
  if (userError || !created.user) throw new Error(`Could not seed the TEST owner: ${userError?.message}`);
  const ownerId = created.user.id;
  await db.from("profiles").upsert({ user_id: ownerId, full_name: "TEST Owner" });

  const slug = "test-pay-academy";
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name: "TEST Kickers Academy",
      slug,
      status: "approved",
      one_liner: "TEST — delete. For screenshots only.",
      whatsapp_e164: "+12425550100",
      phone_e164: "+12425550100",
      public_email: "test-delete-academy@test.portpass.local",
      brand_color: "#0E7C86",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST business: ${orgError?.message}`);
  const orgId = Number(org.id);
  await db.from("organization_members").insert({ organization_id: orgId, user_id: ownerId, role: "org_owner" });
  const { error: settingsError } = await db.from("organization_payment_settings").insert({
    organization_id: orgId,
    reference_prefix: "TKA",
    bank_name: "TEST Bank of Nassau",
    account_name: "TEST Kickers Academy",
    account_number_last4: "0042",
    transfer_instructions: "TEST — Transit 00000, account 000-TEST-0042.\nPut your reference in the transfer note.",
    kanoo_handle_or_phone: "242 555 0100",
    cash_note: "TEST — At the front desk, Mon–Fri 4–7 pm",
    default_due_days: 7,
  });
  if (settingsError) throw new Error(`Could not seed the payment settings: ${settingsError.message}`);
  const { error: offeringError } = await db.from("offerings").insert({ organization_id: orgId, type: "program", slug: "test-term", name: "TEST Term 2 fee", price_cents: 42000, is_published: false });
  if (offeringError) console.warn(`(offering not seeded: ${offeringError.message})`);

  const seeds: Seed[] = [
    { key: "unpaid", customer: "TEST Parent Rolle", phone: "+12425550101", email: "test-delete-rolle@test.portpass.local", lines: [{ label: "Lil Kickers term fee — Amara", qty: 1, unit_cents: 42000 }, { label: "TEST kit bag", qty: 1, unit_cents: 1500 }], due: 7, methods: ["bank_transfer", "cash", "kanoo_wallet_manual"], sent: "whatsapp_link" },
    { key: "paid", customer: "TEST Parent Ferguson", phone: "+12425550102", email: null, lines: [{ label: "Private session Sat 3 Oct — Jayden", qty: 1, unit_cents: 6000 }], due: 3, sent: "whatsapp_link", paid: [{ cents: 6000, method: "bank_transfer", reference: "TEST-TRF-118" }] },
    { key: "part", customer: "TEST Parent Knowles", phone: "+12425550103", email: null, lines: [{ label: "Lil Kickers term fee — Zion", qty: 1, unit_cents: 42000 }], due: 10, part: true, sent: "link", paid: [{ cents: 20000, method: "cash" }] },
    { key: "overdue1", customer: "TEST Parent Cartwright", phone: "+12425550104", email: "test-delete-cartwright@test.portpass.local", lines: [{ label: "Mini Kickers term fee — Leah", qty: 1, unit_cents: 36000 }], due: -12, sent: "whatsapp_link", remindedHoursAgo: 30 },
    { key: "overdue2", customer: "TEST Parent Bethel", phone: "+12425550105", email: null, lines: [{ label: "Lil Kickers weekly fee — Noah", qty: 4, unit_cents: 4500 }], due: -5, sent: "in_person", remindedHoursAgo: 2 },
    { key: "overdue3", customer: "TEST Parent Moss", phone: "+12425550106", email: "test-delete-moss@test.portpass.local", lines: [{ label: "Holiday camp — Kai", qty: 1, unit_cents: 15000 }], due: -1, sent: "email" },
    { key: "says", customer: "TEST Parent Sands", phone: "+12425550107", email: null, lines: [{ label: "Lil Kickers term fee — Mia", qty: 1, unit_cents: 42000 }], due: 5, sent: "whatsapp_link", saysPaid: "Sent by transfer this morning, ref 4471" },
    { key: "draft", customer: "TEST Parent Strachan", phone: "+12425550108", email: null, lines: [{ label: "TEST Term 2 fee", qty: 1, unit_cents: 42000 }], due: 7, sent: null },
    { key: "void", customer: "TEST Parent Wrong", phone: "+12425550109", email: null, lines: [{ label: "TEST duplicate", qty: 1, unit_cents: 42000 }], due: 7, sent: "whatsapp_link", voided: "TEST — sent twice by mistake" },
  ];

  const fixture: Record<string, unknown> = { ownerEmail, slug, orgId };
  for (const s of seeds) {
    const total = s.lines.reduce((sum, l) => sum + l.qty * l.unit_cents, 0);
    const publicToken = token();
    const { data: request, error } = await db.rpc("payment_request_create", {
      p: {
        organization_id: orgId,
        default_prefix: "TKA",
        public_token: publicToken,
        customer_name: s.customer,
        customer_phone: s.phone,
        customer_email: s.email,
        line_items: s.lines,
        total_cents: total,
        due_date: nassauDay(s.due),
        allow_part_payment: s.part ?? false,
        methods_allowed: s.methods ?? ["bank_transfer", "cash"],
        created_by: ownerId,
        created_by_name: "TEST Owner",
      },
    });
    if (error || !request) throw new Error(`Could not seed request ${s.key}: ${error?.message}`);
    const id = Number((request as { id: number }).id);
    const update: Record<string, unknown> = {};
    if (s.sent) Object.assign(update, { sent_at: hoursAgo(72), sent_via: s.sent });
    if (s.remindedHoursAgo !== undefined) Object.assign(update, { last_reminded_at: hoursAgo(s.remindedHoursAgo), last_reminded_via: "whatsapp_link", reminder_count: 1 });
    if (s.saysPaid) Object.assign(update, { customer_says_paid_at: hoursAgo(1), customer_says_paid_note: s.saysPaid });
    if (Object.keys(update).length) {
      const { error: updateError } = await db.from("payment_requests").update(update).eq("id", id);
      if (updateError) throw new Error(`Could not update request ${s.key}: ${updateError.message}`);
    }
    const receipts: string[] = [];
    for (const p of s.paid ?? []) {
      const { data: paid, error: payError } = await db.rpc("payment_request_record_payment", {
        p: { organization_id: orgId, request_id: id, amount_cents: p.cents, method: p.method, received_at: hoursAgo(20), reference: p.reference ?? "", recorded_by: "TEST Owner" },
      });
      if (payError) throw new Error(`Could not record a payment on ${s.key}: ${payError.message}`);
      receipts.push((paid as { receipt_number: string }).receipt_number);
    }
    if (s.voided) {
      const { error: voidError } = await db.from("payment_requests").update({ status: "void", voided_reason: s.voided }).eq("id", id);
      if (voidError) throw new Error(`Could not void ${s.key}: ${voidError.message}`);
    }
    fixture[s.key] = { id, token: publicToken, receipts };
  }

  writeFileSync(out, JSON.stringify(fixture));
  console.log(`Seeded TEST payment requests for ${slug} (org ${orgId}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
