import type { DeliveryStatus } from "@/lib/resendWebhook";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Admin Control Center, build C (brief 08): the Messages log (1.10) and
// what the health tiles on the Overview read (1.1). Nothing here holds the
// text of an email, an error message or anything about a customer beyond
// the address an email was sent to.

// ---- Messages log -------------------------------------------------------------------

export const MESSAGE_STATUSES = ["sent", "delivered", "bounced", "complained", "failed", "skipped"] as const;
export type MessageLogStatus = (typeof MESSAGE_STATUSES)[number];

// The ones that mean "it did not arrive".
export const MESSAGE_PROBLEMS: MessageLogStatus[] = ["failed", "bounced", "complained"];

export type LoggedMessage = { id: number; organizationId: number | null; organizationName: string; template: string; recipient: string; status: MessageLogStatus; detail: string | null; createdAt: string };

export const MESSAGES_ON_SCREEN = 200;

export async function listMessages(filter: { status?: MessageLogStatus | "problems" | null; template?: string | null; q?: string | null } = {}): Promise<LoggedMessage[]> {
  let query = getSupabaseAdmin().from("message_log").select("id,organization_id,template,recipient,status,detail,created_at,organizations(name)").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(MESSAGES_ON_SCREEN);
  if (filter.status === "problems") query = query.in("status", MESSAGE_PROBLEMS);
  else if (filter.status) query = query.eq("status", filter.status);
  if (filter.template) query = query.eq("template", filter.template);
  // An exact address, lowercased: what was typed never becomes a pattern.
  const q = filter.q?.trim().toLowerCase();
  if (q) query = query.eq("recipient", q);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load the messages log");
  return (data ?? []).map((row) => {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string } | null;
    return { id: Number(row.id), organizationId: row.organization_id === null ? null : Number(row.organization_id), organizationName: org?.name ?? "", template: String(row.template), recipient: String(row.recipient), status: row.status as MessageLogStatus, detail: (row.detail as string | null) ?? null, createdAt: String(row.created_at) };
  });
}

export async function countMessageProblems(sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("message_log").select("id", { count: "exact", head: true }).in("status", MESSAGE_PROBLEMS).gte("created_at", sinceIso);
  throwIfSupabaseError(error, "Could not count failed emails");
  return count ?? 0;
}

// What the email service reported for an email PortPass logged as sent.
// "Delivered" or "failed" never overwrites a bounce or a complaint that
// arrived first, and "failed" never overwrites "delivered".
export async function markDelivery(providerId: string, status: DeliveryStatus, detail: string | null): Promise<void> {
  const from: MessageLogStatus[] = status === "delivered" || status === "failed" ? ["sent"] : ["sent", "delivered"];
  const { error } = await getSupabaseAdmin().from("message_log").update({ status, detail }).eq("provider_id", providerId).in("status", from);
  throwIfSupabaseError(error, "Could not update the messages log");
}

// ---- Site errors --------------------------------------------------------------------

export type SiteError = { id: number; route: string; routeType: string; errorName: string; digest: string | null; createdAt: string };

const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

// One row per server-side failure: the route's pattern, the kind of error
// and the digest to look up in the host's logs. Never the address (it can
// hold a reference code or a token) and never the error's message (it can
// quote what someone typed).
export async function recordSiteError(input: { route: string; routeType: string; errorName: string; digest: string | null }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("site_errors").insert({ route: clip(input.route, 200) || "unknown", route_type: clip(input.routeType, 20), error_name: clip(input.errorName, 60), digest: input.digest ? clip(input.digest, 40) : null });
  throwIfSupabaseError(error, "Could not record the site error");
}

export async function countSiteErrors(sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("site_errors").select("id", { count: "exact", head: true }).gte("created_at", sinceIso);
  throwIfSupabaseError(error, "Could not count site errors");
  return count ?? 0;
}

export async function listSiteErrors(limit = 100): Promise<SiteError[]> {
  const { data, error } = await getSupabaseAdmin().from("site_errors").select("id,route,route_type,error_name,digest,created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  throwIfSupabaseError(error, "Could not load site errors");
  return (data ?? []).map((row) => ({ id: Number(row.id), route: String(row.route), routeType: String(row.route_type ?? ""), errorName: String(row.error_name ?? ""), digest: (row.digest as string | null) ?? null, createdAt: String(row.created_at) }));
}

// ---- Retention ----------------------------------------------------------------------

export const MESSAGE_LOG_KEEP_DAYS = 365;
export const SITE_ERRORS_KEEP_DAYS = 30;

// Run by the daily job: the Messages log is kept for a year (the Privacy
// Policy says so), site errors for a month.
export async function pruneHealthRecords(now: Date = new Date()): Promise<void> {
  const db = getSupabaseAdmin();
  const before = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const messages = await db.from("message_log").delete().lt("created_at", before(MESSAGE_LOG_KEEP_DAYS));
  throwIfSupabaseError(messages.error, "Could not prune the messages log");
  const errors = await db.from("site_errors").delete().lt("created_at", before(SITE_ERRORS_KEEP_DAYS));
  throwIfSupabaseError(errors.error, "Could not prune site errors");
}

// ---- Backup heartbeat -----------------------------------------------------------------

export type BackupHeartbeat = { at: string; ok: boolean };

// The backup machine reports in after each nightly backup (the OptiPlex
// script calls POST /api/heartbeat/backup). Kept as one row in site_content.
export async function saveBackupHeartbeat(ok: boolean, now: Date = new Date()): Promise<void> {
  const { error } = await getSupabaseAdmin().from("site_content").upsert({ key: "backup_heartbeat", value: { at: now.toISOString(), ok }, updated_at: now.toISOString() }, { onConflict: "key" });
  throwIfSupabaseError(error, "Could not record the backup heartbeat");
}

export async function getBackupHeartbeat(): Promise<BackupHeartbeat | null> {
  const { data, error } = await getSupabaseAdmin().from("site_content").select("value").eq("key", "backup_heartbeat").maybeSingle();
  throwIfSupabaseError(error, "Could not load the backup heartbeat");
  const value = data?.value as { at?: unknown; ok?: unknown } | undefined;
  return value && typeof value.at === "string" ? { at: value.at, ok: value.ok !== false } : null;
}

// ---- Sign-in email -------------------------------------------------------------------

// Sign-in codes are emailed by the sign-in service itself, so they never
// pass through the Messages log. What PortPass can see is a code being
// typed in correctly: that email arrived. Only the time is kept (one row
// in site_content), never who signed in (brief 19, part F).
export async function saveSignInCodeUsed(now: Date = new Date()): Promise<void> {
  const { error } = await getSupabaseAdmin().from("site_content").upsert({ key: "sign_in_code_used", value: { at: now.toISOString() }, updated_at: now.toISOString() }, { onConflict: "key" });
  throwIfSupabaseError(error, "Could not record the sign-in");
}

export async function getSignInCodeUsedAt(): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("site_content").select("value").eq("key", "sign_in_code_used").maybeSingle();
  throwIfSupabaseError(error, "Could not load the last sign-in by code");
  const value = data?.value as { at?: unknown } | undefined;
  return value && typeof value.at === "string" ? value.at : null;
}

// ---- Database checks ------------------------------------------------------------------

export type DatabaseCheck = { name: string; problems: number };

export const DATABASE_CHECK_LABEL: Record<string, string> = {
  tables_without_rls: "Tables with row level security off",
  functions_without_search_path: "Functions without a fixed search path",
  definer_functions_open_to_browser_roles: "Privileged functions a browser could call",
};

// The first three things Supabase's security advisor warns about, checked
// against the live database (supabase/migrations/202610080001).
export async function databaseChecks(): Promise<DatabaseCheck[]> {
  const { data, error } = await getSupabaseAdmin().rpc("admin_database_checks");
  throwIfSupabaseError(error, "Could not run the database checks");
  return ((data ?? []) as Array<{ check_name: string; problems: number }>).map((row) => ({ name: String(row.check_name), problems: Number(row.problems) }));
}
