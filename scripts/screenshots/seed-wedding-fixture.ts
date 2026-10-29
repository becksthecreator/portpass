// Seeds a TEST Wedding Desk login for the wedding screenshot job
// (.github/workflows/wedding-screenshots.yml). Runs only against the
// throwaway local Supabase stack that job starts, after
// scripts/seed-test-data.ts -- never against a real project. The gallery
// rows it photographs are the ones the migrations seed (all site photos).
//
// The PIN comes from the SCREENSHOT_PIN environment variable, which the
// workflow generates at random for this one run and masks in the logs;
// only its salted hash is stored.
import { createClient } from "@supabase/supabase-js";
import { hashPin } from "../../lib/pinHash";
import { assertLocalSupabase } from "../../lib/localStackOnly.mjs";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const pin = process.env.SCREENSHOT_PIN;
  if (!url || !key || !pin) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY and SCREENSHOT_PIN must be set.");
  assertLocalSupabase();
  const db = createClient(url, key);

  const { data: org, error: orgError } = await db.from("organizations").select("id").eq("slug", "bahamas-weddings").single();
  if (orgError || !org) throw new Error(`The wedding organization is missing: ${orgError?.message ?? "no row"}`);

  const { error } = await db.from("staff_members").insert({
    organization_id: Number(org.id),
    name: "TEST — delete Wedding Desk",
    role: "wedding_desk",
    account_key: "test-wedding-desk",
    pin_hash: await hashPin(pin),
    responsibilities: "",
    active: true,
  });
  if (error) throw new Error(`Could not seed the Wedding Desk login: ${error.message}`);
  console.log("Seeded a TEST Wedding Desk login.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
