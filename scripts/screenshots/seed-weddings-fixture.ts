// Seeds the one TEST account the wedding screenshot job signs in with
// (.github/workflows/weddings-screenshots.yml): a Wedding Desk account on
// Bahamas Weddings By The Sea, in the throwaway local Supabase stack that
// job starts, never a real project. Its name is "TEST — delete".
//
// The PIN comes from the SCREENSHOT_PIN environment variable, which the
// workflow generates at random for this one run and masks in the logs.
// Only its hash is stored.
import { createClient } from "@supabase/supabase-js";
import { hashPin } from "../../lib/pinHash";

// scripts/screenshots/capture-weddings.mjs signs in as this account.
const DESK_ACCOUNT = "test-delete-desk";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const pin = process.env.SCREENSHOT_PIN;
  if (!url || !key || !pin) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY and SCREENSHOT_PIN must be set.");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to seed anything but a local Supabase stack.");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: org, error: orgError } = await db.from("organizations").select("id").eq("slug", "bahamas-weddings").single();
  if (orgError || !org) throw new Error(`Bahamas Weddings By The Sea is not in this stack: ${orgError?.message ?? "no row"}`);

  await db.from("staff_members").delete().eq("account_key", DESK_ACCOUNT);
  const { error } = await db.from("staff_members").insert({
    organization_id: org.id,
    name: "TEST — delete Wedding Desk",
    role: "wedding_desk",
    account_key: DESK_ACCOUNT,
    pin_hash: await hashPin(pin),
    responsibilities: "",
    active: true,
  });
  if (error) throw new Error(`Could not seed the TEST Desk account: ${error.message}`);
  console.log(`Seeded ${DESK_ACCOUNT} on Bahamas Weddings By The Sea.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
