import { isPointsReason, type PointsReason } from "@/lib/points";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass Points (brief 25, part D): one account holder's own balance and
// history, read on the server for the account page, and the daily job's
// expiry. Points are written only by the database (202610200004_points.sql:
// attendance marked present, a Market order marked paid, expiry); nothing
// here writes one. An event carries a reason, the business and a reference
// number, never anything about a child.

export type PointsEvent = { id: number; delta: number; reason: PointsReason; refType: string | null; businessName: string | null; createdAt: string; expiresAt: string | null; settled: boolean };

export type MyPoints = { balance: number; events: PointsEvent[]; rules: { perDollar: number; perAttendance: number } };

const HISTORY = 50;

export async function getMyPoints(userId: string): Promise<MyPoints> {
  const db = getSupabaseAdmin();
  const [{ data: account, error }, { data: settings, error: settingsError }] = await Promise.all([
    db.from("points_accounts").select("id,balance").eq("user_id", userId).maybeSingle(),
    db.from("market_settings").select("points_per_dollar,points_per_attendance").eq("id", true).maybeSingle(),
  ]);
  throwIfSupabaseError(error, "Could not load your points");
  throwIfSupabaseError(settingsError, "Could not load the points rules");
  const rules = { perDollar: Number(settings?.points_per_dollar ?? 1), perAttendance: Number(settings?.points_per_attendance ?? 10) };
  if (!account) return { balance: 0, events: [], rules };
  const { data: rows, error: eventsError } = await db
    .from("points_events")
    .select("id,delta,reason,ref_type,organization_id,created_at,expires_at,expired_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY);
  throwIfSupabaseError(eventsError, "Could not load your points history");
  const orgIds = Array.from(new Set((rows ?? []).map((row) => row.organization_id).filter((id): id is number => id !== null).map(Number)));
  const { data: orgs, error: orgsError } = orgIds.length ? await db.from("organizations").select("id,name").in("id", orgIds) : { data: [], error: null };
  throwIfSupabaseError(orgsError, "Could not load the businesses for your points");
  const name = new Map((orgs ?? []).map((org) => [Number(org.id), org.name as string]));
  return {
    balance: Number(account.balance),
    rules,
    events: (rows ?? [])
      .filter((row) => isPointsReason(row.reason))
      .map((row) => ({ id: Number(row.id), delta: Number(row.delta), reason: row.reason as PointsReason, refType: (row.ref_type as string | null) ?? null, businessName: row.organization_id === null ? null : (name.get(Number(row.organization_id)) ?? null), createdAt: row.created_at as string, expiresAt: (row.expires_at as string | null) ?? null, settled: row.expired_at !== null })),
  };
}

// The daily job: earned points older than 12 months come off, once each.
export async function expirePoints(): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("points_expire");
  throwIfSupabaseError(error, "Could not expire points");
  return Number(data ?? 0);
}
