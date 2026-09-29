// @public-route: the uptime monitor's ping. Says whether the app answers
// and whether the database does, nothing else: no counts, no secrets.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/db/supabase";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

async function databaseOk(): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    // The cheapest round trip PostgREST offers: a HEAD count on a tiny
    // table, capped at three seconds so a slow database reads as "down"
    // rather than a hanging monitor.
    const probe = supabase.from("pricing_plans").select("code", { head: true, count: "exact" }).limit(1);
    const result = await Promise.race([
      probe.then((r) => (r.error ? false : true)),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DB_TIMEOUT_MS)),
    ]);
    return result;
  } catch {
    return false;
  }
}

export async function GET() {
  const db = await databaseOk();
  return NextResponse.json(
    { ok: true, db, time: new Date().toISOString() },
    { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
