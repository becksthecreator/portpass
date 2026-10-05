import { CARV_SLUG, SCOUT_SETTINGS, settingsSet, type Phase1Facts } from "@/lib/phase1";
import { getBackupHeartbeat, getSignInCodeUsedAt } from "./adminHealth";
import { demoOrganizationIdOrNull, getDemoBusiness } from "./demo";
import { listBusinessChecklists } from "./pageChecklist";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The live state Admin -> Phase 1 reads (brief 19, part F). Each fact is
// read on its own: one that can't be read comes back undefined, and the
// page says so on that line and shows the rest.
//
// The settings are reported as set or not set, by name. Their values are
// never read into the result.

async function attempt<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    console.error(`phase 1: ${what}`, error instanceof Error ? error.message : "");
    return undefined;
  }
}

// Live member perks, not counting the demo's.
async function countLivePerks(): Promise<number> {
  const demoId = await demoOrganizationIdOrNull();
  let query = getSupabaseAdmin().from("member_perks").select("id", { count: "exact", head: true }).eq("status", "live");
  if (demoId !== null) query = query.neq("organization_id", demoId);
  const { count, error } = await query;
  throwIfSupabaseError(error, "Could not count live perks");
  return count ?? 0;
}

async function countPublishedGuides(): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("guides").select("id", { count: "exact", head: true }).eq("status", "published");
  throwIfSupabaseError(error, "Could not count published guides");
  return count ?? 0;
}

async function carvState(): Promise<{ status: string; isPublished: boolean } | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("status,is_published").eq("slug", CARV_SLUG).maybeSingle();
  throwIfSupabaseError(error, "Could not load Carv");
  return data ? { status: String(data.status ?? "draft"), isPublished: Boolean(data.is_published) } : null;
}

export async function loadPhase1Facts(env: Record<string, string | undefined> = process.env): Promise<Phase1Facts> {
  const [backup, signInCodeUsedAt, businesses, livePerks, publishedGuides, carv, demo] = await Promise.all([
    attempt("backup heartbeat", () => getBackupHeartbeat()),
    attempt("sign-in by code", () => getSignInCodeUsedAt()),
    attempt("page checklists", () => listBusinessChecklists()),
    attempt("live perks", () => countLivePerks()),
    attempt("published guides", () => countPublishedGuides()),
    attempt("Carv", () => carvState()),
    attempt("demo", () => getDemoBusiness()),
  ]);
  return {
    settings: settingsSet(env, ["CRON_SECRET", ...SCOUT_SETTINGS]),
    backup,
    signInCodeUsedAt,
    businesses,
    livePerks,
    publishedGuides,
    carv,
    demoResetAt: demo === undefined ? undefined : demo?.resetAt ?? null,
  };
}
