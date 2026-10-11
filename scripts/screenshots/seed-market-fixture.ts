// Seeds TEST data for the PortPass Market screenshot job (.github/workflows/
// market-screenshots.yml, brief 25). Runs after seed-shop-fixture.ts (whose
// TEST Kit Shop is a verified seller) and only against the throwaway local
// Supabase stack that job starts -- never against a real project. Every
// name is TEST; no real brand, buyer, licence or phone number.
//
// Adds: a TEST platform owner (the workflow puts the address in
// PLATFORM_OWNER_EMAILS for the run), a TEST seller waiting to be verified
// and a TEST seller PortPass suspended, so Admin -> Market -> Sellers shows
// each state. Part C: TEST bank-transfer details for the TEST Kit Shop,
// so its order form offers bank transfer and cash (the details are TEST
// words and a 0000 ending, nothing real), and a TEST product outside its
// open drop, which is ordered on its Market page. Writes what the capture script
// needs to $MARKET_FIXTURE.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = process.env.MARKET_FIXTURE;
  if (!url || !key || !out) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY and MARKET_FIXTURE must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");
  const db = createClient(url, key);

  const adminEmail = "test-delete-market-admin@test.portpass.local";
  const { error: adminError } = await db.auth.admin.createUser({ email: adminEmail, email_confirm: true });
  if (adminError) throw new Error(`Could not seed the TEST admin: ${adminError.message}`);

  const sellers = [
    { name: "TEST Island Candles (delete)", slug: "test-island-candles", prefix: "TIC", status: "pending", category: "home", sells: "TEST — hand-poured candles in island scents", reason: null, licence: "TEST-BL-00042" },
    { name: "TEST Conch Crafts (delete)", slug: "test-conch-crafts", prefix: "TCC", status: "suspended", category: "crafts-gifts", sells: "TEST — shell jewellery", reason: "TEST — paused while we check a product photo", licence: "TEST-BL-00043" },
  ];
  for (const [index, s] of sellers.entries()) {
    const { data: org, error } = await db
      .from("organizations")
      .insert({ name: s.name, slug: s.slug, primary_category: "shop", status: "draft", whatsapp_e164: `+124255501${50 + index}`, primary_contact: "TEST Contact", licences: [{ type: "Business licence", number: s.licence }], created_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !org) throw new Error(`Could not seed ${s.name}: ${error?.message}`);
    const { error: shopError } = await db.from("shops").insert({
      organization_id: org.id,
      reference_prefix: s.prefix,
      returns_policy: "",
      hold_hours: 48,
      is_published: false,
      seller_status: s.status,
      seller_status_reason: s.reason,
      seller_applied_at: new Date(Date.now() - (index + 1) * 86400_000).toISOString(),
      market_category: s.category,
      what_they_sell: s.sells,
      seller_pickup_note: "TEST — Shirley Street studio, weekdays 10am to 5pm",
      seller_delivery_zones: [{ zone: "Downtown", fee_cents: 500, lead_days: 1 }],
      accepts_cash_on_pickup: index === 0,
    });
    if (shopError) throw new Error(`Could not seed the shop for ${s.name}: ${shopError.message}`);
  }

  const { data: kit, error: kitError } = await db.from("organizations").select("id").eq("slug", "test-kit-shop").single();
  if (kitError || !kit) throw new Error(`Could not find the TEST Kit Shop: ${kitError?.message}`);
  const { error: payError } = await db.from("organization_payment_settings").upsert({ organization_id: kit.id, reference_prefix: "TKP", accepted_methods: ["bank_transfer", "cash"], bank_name: "TEST Bank", account_name: "TEST Kit Shop", account_number_last4: "0000", transfer_instructions: "TEST — not a real account", cash_note: "TEST — at the studio" });
  if (payError) throw new Error(`Could not seed the TEST payment settings: ${payError.message}`);

  const { data: tee, error: teeError } = await db.from("products").insert({ organization_id: kit.id, slug: "training-tee", title: "TEST Training tee", description: "TEST — delete. Light cotton, made in Nassau.", price_cents: 3000, photos: [], market_category: "kits-apparel", sort_order: 9, is_published: false }).select("id").single();
  if (teeError || !tee) throw new Error(`Could not seed the TEST tee: ${teeError?.message}`);
  const { error: sizeError } = await db.from("product_variants").insert([
    { product_id: tee.id, label: "S", stock: 4, sort_order: 0 },
    { product_id: tee.id, label: "M", stock: 6, sort_order: 1 },
    { product_id: tee.id, label: "L", stock: null, sort_order: 2 },
  ]);
  if (sizeError) throw new Error(`Could not seed the TEST tee's sizes: ${sizeError.message}`);
  const { error: publishError } = await db.from("products").update({ is_published: true }).eq("id", tee.id);
  if (publishError) throw new Error(`Could not publish the TEST tee: ${publishError.message}`);

  writeFileSync(out, JSON.stringify({ adminEmail, kitShopId: kit.id }, null, 2));
  console.log("Seeded the TEST Market admin and sellers.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
