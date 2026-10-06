// Seeds TEST data for the motion check (.github/workflows/motion-checks.yml,
// scripts/motion/check.mjs), after scripts/seed-test-data.ts, on the
// throwaway local Supabase stack that job starts and nothing else. Every
// name is "TEST — delete".
//
// One business, live in Entertainment, so that section's page is a live
// category page with a card, an "Open now" label and its subsection chips
// (the Bounce Badges, the icon and title morph from the homepage). It is
// first in the homepage order (Admin -> Content), which makes it featured,
// and its logo is a vector file, so the featured logo's idle bounce has a
// mark to move. It is published the way an owner would be: approved, a
// priced offering, then live (no price, no publish).
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
// The host itself, not a substring of the address: this script creates an
// auth user, so it refuses anything but a local stack.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)) throw new Error("Refusing to seed anything but a local Supabase stack.");
const db = createClient(url, process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

const SLUG = "test-delete-motion-venue";
const stamp = new Date().toISOString();

async function main() {
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name: "TEST Motion Venue (delete)",
      slug: SLUG,
      primary_category: "entertainment",
      status: "approved",
      one_liner: "TEST — delete. A venue for the motion check only.",
      whatsapp_e164: "+12425550101",
      brand_color: "#2463AE",
      // Any vector file serves; this one is already in public/.
      logo_url: "/favicon.svg",
      payment_methods: ["cash"],
      created_at: stamp,
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`Could not seed the TEST venue: ${orgError?.message ?? "no row"}`);

  const { error: offeringError } = await db.from("offerings").insert({ organization_id: org.id, type: "service", slug: "test-motion-evening", name: "TEST evening hire", summary: "TEST — delete.", price_cents: 25000, is_published: true });
  if (offeringError) throw new Error(`Could not seed the TEST venue's offering: ${offeringError.message}`);

  const { error: liveError } = await db.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", org.id);
  if (liveError) throw new Error(`Could not publish the TEST venue: ${liveError.message}`);

  // First in the homepage order: featured.
  const { data: spotlight } = await db.from("site_content").select("value").eq("key", "home_spotlight").maybeSingle();
  const stored = (spotlight?.value ?? {}) as { order?: unknown };
  const order = Array.isArray(stored.order) ? stored.order.filter((slug): slug is string => typeof slug === "string" && slug !== SLUG) : [];
  const { error: spotlightError } = await db.from("site_content").upsert({ key: "home_spotlight", value: { order: [SLUG, ...order] } }, { onConflict: "key" });
  if (spotlightError) throw new Error(`Could not put the TEST venue first in the homepage order: ${spotlightError.message}`);

  // A TEST platform owner (the workflow puts this address in
  // PLATFORM_OWNER_EMAILS for the run), who saves the motion switch in
  // Admin -> Content during the check (brief 22, M5). A .local address: no
  // mail can reach it, and none is sent (the check asks the local stack
  // for a sign-in code directly).
  const { error: adminError } = await db.auth.admin.createUser({ email: "test-delete-motion-admin@test.portpass.local", email_confirm: true });
  if (adminError) throw new Error(`Could not seed the TEST platform owner: ${adminError.message}`);

  console.log("Seeded the TEST motion venue (Entertainment, featured, vector logo) and the TEST platform owner.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
