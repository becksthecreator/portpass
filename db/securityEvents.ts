import type { SecurityEventKind } from "@/lib/alerts";
import { SECURITY_EVENTS_KEPT_DAYS } from "@/lib/alerts";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// security_events and admin_devices (202610180003): what the alerts count
// and Admin -> Security shows. Never an email address, a PIN or a code.

export async function recordSecurityEvent(kind: SecurityEventKind, ip: string | null, detail: Record<string, unknown> | null = null): Promise<void> {
  const { error } = await getSupabaseAdmin().from("security_events").insert({ kind, ip: ip?.slice(0, 64) ?? null, detail });
  throwIfSupabaseError(error, "Could not record the security event");
}

export async function countSecurityEvents(kinds: readonly SecurityEventKind[], sinceIso: string): Promise<Partial<Record<SecurityEventKind, number>>> {
  const { data, error } = await getSupabaseAdmin().from("security_events").select("kind").in("kind", [...kinds]).gte("created_at", sinceIso).limit(10_000);
  throwIfSupabaseError(error, "Could not count security events");
  const counts: Partial<Record<SecurityEventKind, number>> = {};
  for (const row of data ?? []) {
    const kind = row.kind as SecurityEventKind;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export type SecurityEventRow = { id: number; kind: SecurityEventKind; ip: string | null; detail: Record<string, unknown> | null; createdAt: string };

export async function listSecurityEvents(limit = 100): Promise<SecurityEventRow[]> {
  const { data, error } = await getSupabaseAdmin().from("security_events").select("id,kind,ip,detail,created_at").order("id", { ascending: false }).limit(limit);
  throwIfSupabaseError(error, "Could not load security events");
  return (data ?? []).map((row) => ({ id: Number(row.id), kind: row.kind as SecurityEventKind, ip: (row.ip as string | null) ?? null, detail: (row.detail as Record<string, unknown> | null) ?? null, createdAt: String(row.created_at) }));
}

// The addresses behind the failed sign-ins in a window, most first: what a
// founder reads when the alert arrives.
export async function failedSignInsByAddress(kinds: readonly SecurityEventKind[], sinceIso: string, limit = 10): Promise<Array<{ ip: string; count: number }>> {
  const { data, error } = await getSupabaseAdmin().from("security_events").select("ip").in("kind", [...kinds]).gte("created_at", sinceIso).limit(10_000);
  throwIfSupabaseError(error, "Could not read security events");
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const ip = (row.ip as string | null) ?? "unknown";
    counts.set(ip, (counts.get(ip) ?? 0) + 1);
  }
  return [...counts.entries()].map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export async function pruneSecurityEvents(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - SECURITY_EVENTS_KEPT_DAYS * 24 * 3600_000).toISOString();
  const { error } = await getSupabaseAdmin().from("security_events").delete().lt("created_at", cutoff);
  throwIfSupabaseError(error, "Could not prune security events");
}

// ---- admin devices ---------------------------------------------------------------

// Remembers the device and says whether it was new. Last seen is updated
// on a known device.
export async function rememberAdminDevice(userId: string, hash: string, label: string, now: Date = new Date()): Promise<{ isNew: boolean }> {
  const db = getSupabaseAdmin();
  const { data: known, error: readError } = await db.from("admin_devices").select("id").eq("user_id", userId).eq("device_hash", hash).maybeSingle();
  throwIfSupabaseError(readError, "Could not read admin devices");
  if (known) {
    const { error } = await db.from("admin_devices").update({ last_seen_at: now.toISOString(), label }).eq("id", known.id);
    throwIfSupabaseError(error, "Could not update the admin device");
    return { isNew: false };
  }
  const { error } = await db.from("admin_devices").insert({ user_id: userId, device_hash: hash, label, first_seen_at: now.toISOString(), last_seen_at: now.toISOString() });
  if (error && (error as { code?: string }).code === "23505") return { isNew: false };
  throwIfSupabaseError(error, "Could not remember the admin device");
  return { isNew: true };
}

export type AdminDeviceRow = { id: number; userId: string; label: string; firstSeenAt: string; lastSeenAt: string };

export async function listAdminDevices(limit = 50): Promise<AdminDeviceRow[]> {
  const { data, error } = await getSupabaseAdmin().from("admin_devices").select("id,user_id,label,first_seen_at,last_seen_at").order("last_seen_at", { ascending: false }).limit(limit);
  throwIfSupabaseError(error, "Could not load admin devices");
  return (data ?? []).map((row) => ({ id: Number(row.id), userId: String(row.user_id), label: String(row.label), firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at) }));
}
