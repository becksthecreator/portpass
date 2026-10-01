// Seeds a TEST shop for the shop screenshot job (.github/workflows/
// shop-screenshots.yml, brief 15). Runs only against the throwaway local
// Supabase stack that job starts -- never against a real project. Every
// name is TEST; no real brand, buyer or phone number. Product photos are
// drawn here as SVG data URIs (the local stack has no storage).
//
// Writes what the capture script needs to $SCREENSHOT_FIXTURE (JSON).
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function jersey(body: string, trim: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e9eef3"/><path d="M130 70 L170 50 Q200 80 230 50 L270 70 L350 130 L315 190 L285 170 L285 430 L115 430 L115 170 L85 190 L50 130 Z" fill="${body}" stroke="${trim}" stroke-width="8"/><text x="200" y="300" font-family="Arial" font-size="72" font-weight="700" fill="${trim}" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function cap(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e9eef3"/><path d="M80 300 Q90 170 200 160 Q310 170 320 300 Z" fill="#0d1b3d"/><path d="M300 300 L380 320 L300 330 Z" fill="#0d1b3d"/><rect x="80" y="296" width="240" height="14" fill="#f2c14e"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const day = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = process.env.SCREENSHOT_FIXTURE;
  if (!url || !key || !out) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY and SCREENSHOT_FIXTURE must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");
  const db = createClient(url, key);

  const ownerEmail = "test-delete-shop-owner@test.portpass.local";
  const { data: created, error: userError } = await db.auth.admin.createUser({ email: ownerEmail, email_confirm: true });
  if (userError || !created.user) throw new Error(`Could not seed the TEST owner: ${userError?.message}`);
  const ownerId = created.user.id;
  await db.from("profiles").upsert({ user_id: ownerId, full_name: "TEST Owner" });

  const slug = "test-kit-shop";
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name: "TEST Kit Shop",
      slug,
      primary_category: "shop",
      subcategory: "apparel-merch",
      status: "approved",
      one_liner: "TEST — delete. Jerseys and caps, for screenshots only.",
      whatsapp_e164: "+12425550100",
      brand_color: "#0E7C86",
      payment_methods: ["bank_transfer", "cash"],
      bank_transfer_details: { bank: "TEST Bank", accountName: "TEST Kit Shop", accountNumber: "000-TEST-000", branch: "TEST branch", instructions: "Use your reference code." },
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST shop: ${orgError?.message}`);
  const orgId = Number(org.id);
  await db.from("organization_members").insert({ organization_id: orgId, user_id: ownerId, role: "org_owner" });
  const { error: shopError } = await db.from("shops").insert({ organization_id: orgId, reference_prefix: "TK", returns_policy: "TEST — Exchanges for another size within 7 days of pickup, unworn with tags. Custom names can't be returned.", hold_hours: 48, is_published: true });
  if (shopError) throw new Error(`Could not seed the shop row: ${shopError.message}`);

  type SeedProduct = { slug: string; title: string; description: string; price_cents: number; photos: string[]; uses_marks: boolean; licence_kind: string | null; licence_note: string | null; licence_approved_at: string | null; sizes: [string, number | null][] };
  const products: SeedProduct[] = [
    { slug: "home-jersey", title: "TEST Home jersey", description: "TEST — delete. Breathable mesh, aqua with gold trim. Fan edition.", price_cents: 6500, photos: [jersey("#0E7C86", "#f2c14e", "10"), jersey("#0E7C86", "#f2c14e", "TK")], uses_marks: true, licence_kind: "fan_edition", licence_note: "TEST — fan design, no official crest.", licence_approved_at: new Date().toISOString(), sizes: [["S", 3], ["M", 0], ["L", 5], ["XL", 2]] },
    { slug: "away-jersey", title: "TEST Away jersey", description: "TEST — delete. White with navy trim.", price_cents: 6500, photos: [jersey("#ffffff", "#0d1b3d", "7")], uses_marks: false, licence_kind: null, licence_note: null, licence_approved_at: null, sizes: [["S", null], ["M", null], ["L", null]] },
    { slug: "cap", title: "TEST Cap", description: "TEST — delete. One size, adjustable.", price_cents: 2500, photos: [cap()], uses_marks: false, licence_kind: null, licence_note: null, licence_approved_at: null, sizes: [["One size", 10]] },
  ];
  const variantIds: Record<string, number> = {};
  const productIds: number[] = [];
  const productIdBySlug: Record<string, number> = {};
  for (const [index, p] of products.entries()) {
    const { sizes, ...row } = p;
    const { data: product, error } = await db.from("products").insert({ ...row, organization_id: orgId, sort_order: index, is_published: false }).select("id").single();
    if (error || !product) throw new Error(`Could not seed ${p.title}: ${error?.message}`);
    productIds.push(Number(product.id));
    productIdBySlug[p.slug] = Number(product.id);
    const { error: pubError } = await db.from("products").update({ is_published: true }).eq("id", product.id);
    if (pubError) throw new Error(`Could not publish ${p.title}: ${pubError.message}`);
    const { data: variants, error: vError } = await db.from("product_variants").insert(sizes.map(([label, stock], i) => ({ product_id: product.id, label, stock, sort_order: i }))).select("id,label");
    if (vError || !variants) throw new Error(`Could not seed sizes: ${vError?.message}`);
    for (const v of variants) variantIds[`${p.slug}:${v.label}`] = Number(v.id);
  }
  await db.from("organizations").update({ is_published: true, status: "live" }).eq("id", orgId);

  const { data: drop, error: dropError } = await db
    .from("drops")
    .insert({
      organization_id: orgId,
      slug: "independence",
      title: "TEST Independence drop",
      description: "TEST — delete. Three pieces, limited sizes.",
      hero_image_url: jersey("#0E7C86", "#f2c14e", "TK"),
      opens_at: hours(-26),
      closes_at: hours(120),
      ready_on: day(10),
      pickup_note: "TEST studio, Saturdays 10am to 2pm",
      delivery_note: "TEST — $10 delivery, paid with your order",
      allow_pickup: true,
      allow_delivery: true,
      delivery_zones: ["Nassau East", "Nassau West", "Cable Beach"],
      status: "published",
    })
    .select("id,slug")
    .single();
  if (dropError || !drop) throw new Error(`Could not seed the drop: ${dropError?.message}`);
  await db.from("drop_items").insert(productIds.map((id, i) => ({ drop_id: drop.id, product_id: id, sort_order: i })));

  // Six TEST reservations: paid and collected, paid, waiting, two past the
  // 48-hour hold (offered for release), and one released.
  const item = (slugLabel: string, title: string, label: string, qty: number, unitCents: number) => ({ variantId: variantIds[slugLabel], productId: productIdBySlug[slugLabel.split(":")[0]], title, label, qty, unitCents });
  const reservations = [
    { code: "TK-7KQ3MX", buyer: "TEST Buyer One", phone: "+12425550101", items: [item("home-jersey:M", "TEST Home jersey", "M", 1, 6500)], pay: "bank_transfer", status: "paid", collected: true, source: "portpass", eligible: true, created: -25, fulfilment: "pickup" },
    { code: "TK-RW4PZD", buyer: "TEST Buyer Two", phone: "+12425550102", items: [item("home-jersey:M", "TEST Home jersey", "M", 1, 6500), item("cap:One size", "TEST Cap", "One size", 1, 2500)], pay: "cash", status: "paid", collected: false, source: "instagram", eligible: false, created: -24, fulfilment: "pickup" },
    { code: "TK-HN8VBT", buyer: "TEST Buyer Three", phone: "+12425550103", items: [item("home-jersey:L", "TEST Home jersey", "L", 2, 6500)], pay: "bank_transfer", status: "pending", collected: false, source: "direct", eligible: false, created: -3, fulfilment: "seller_delivery" },
    { code: "TK-C6YJ2E", buyer: "TEST Buyer Four", phone: "+12425550104", items: [item("away-jersey:S", "TEST Away jersey", "S", 1, 6500)], pay: "bank_transfer", status: "pending", collected: false, source: "portpass", eligible: true, created: -50, fulfilment: "pickup" },
    { code: "TK-XG9MAQ", buyer: "TEST Buyer Five", phone: "+12425550105", items: [item("home-jersey:XL", "TEST Home jersey", "XL", 1, 6500)], pay: "cash", status: "pending", collected: false, source: "instagram", eligible: false, created: -49, fulfilment: "pickup" },
    { code: "TK-PD3KWN", buyer: "TEST Buyer Six", phone: "+12425550106", items: [item("cap:One size", "TEST Cap", "One size", 2, 2500)], pay: "cash", status: "released", collected: false, source: "direct", eligible: false, created: -60, fulfilment: "pickup" },
  ];
  let receiptToken = "";
  for (const r of reservations) {
    const created = hours(r.created);
    const token = randomBytes(18).toString("hex");
    if (r.code === "TK-HN8VBT") receiptToken = token;
    const { error } = await db.from("reservations").insert({
      reference_code: r.code,
      receipt_token: token,
      organization_id: orgId,
      drop_id: drop.id,
      buyer_name: r.buyer,
      buyer_phone: r.phone,
      items: r.items,
      total_cents: r.items.reduce((sum, i) => sum + i.qty * i.unitCents, 0),
      payment_method: r.pay,
      payment_status: r.status === "paid" ? "paid" : "pending",
      status: r.status === "released" ? "released" : "active",
      fulfilment: r.fulfilment,
      zone: r.fulfilment === "seller_delivery" ? "Nassau East" : null,
      delivery_note: r.fulfilment === "seller_delivery" ? "TEST — blue gate" : null,
      hold_until: hours(r.created + 48),
      paid_at: r.status === "paid" ? hours(r.created + 2) : null,
      collected_at: r.collected ? hours(-1) : null,
      cancelled_at: r.status === "released" ? hours(-2) : null,
      source: r.source,
      commission_eligible: r.eligible,
      commission_reason: r.eligible ? "PortPass link" : "Direct",
      created_at: created,
    });
    if (error) throw new Error(`Could not seed ${r.code}: ${error.message}`);
  }
  await db.from("drop_waitlist").insert([
    { organization_id: orgId, drop_id: drop.id, variant_id: variantIds["home-jersey:M"], name: "TEST Waiter One", phone: "+12425550107" },
    { organization_id: orgId, drop_id: drop.id, variant_id: variantIds["home-jersey:M"], name: "TEST Waiter Two", phone: "+12425550108" },
  ]);

  writeFileSync(out, JSON.stringify({ ownerEmail, slug, dropId: drop.id, dropSlug: drop.slug, receiptToken }, null, 2));
  console.log(`Seeded TEST shop ${slug}: drop ${drop.id}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
