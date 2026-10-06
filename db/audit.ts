import { demoOrganizationIdOrNull } from "./demo";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type AuditEntry = {
  actorUserId?: string | null;
  organizationId?: number | null;
  action: string;
  targetTable?: string | null;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
  // Where it came from. Left out, it is read from the request (below).
  ip?: string | null;
};

// The caller's address, from the request this code is running for; null
// outside a request (a job, a script, a test). Read lazily so this module
// can be imported anywhere.
export async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const value = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    return value ? value.slice(0, 64) : null;
  } catch {
    return null;
  }
}

// Throws on failure on purpose: the callers that use this (role changes,
// approvals, bank-detail edits) must not succeed silently without a
// record, so a failed audit write fails the action.
export async function logAudit(entry: AuditEntry): Promise<void> {
  // The demo business is example data that anyone can press buttons on and
  // that is wiped every night: none of it belongs in a trail nobody can
  // edit or delete. (Resetting the demo is logged, with no business on it.)
  if (entry.organizationId !== undefined && entry.organizationId !== null && entry.organizationId === (await demoOrganizationIdOrNull())) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: entry.actorUserId ?? null,
    organization_id: entry.organizationId ?? null,
    action: entry.action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId === undefined || entry.targetId === null ? null : String(entry.targetId),
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip === undefined ? await requestIp() : entry.ip,
  });
  throwIfSupabaseError(error, "Could not write audit log entry");
}

export type AuditRow = {
  id: number;
  actorUserId: string | null;
  organizationId: number | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
};

export async function listAudit(filter: { organizationId?: number | null; action?: string | null; actionPrefix?: string | null; limit?: number } = {}): Promise<AuditRow[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("audit_log")
    .select("id,actor_user_id,organization_id,action,target_table,target_id,before,after,ip,created_at")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.actionPrefix) query = query.like("action", `${filter.actionPrefix}%`);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load audit log");
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    actorUserId: row.actor_user_id as string | null,
    organizationId: row.organization_id === null ? null : Number(row.organization_id),
    action: row.action as string,
    targetTable: row.target_table as string | null,
    targetId: row.target_id as string | null,
    before: row.before,
    after: row.after,
    ip: (row.ip as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
