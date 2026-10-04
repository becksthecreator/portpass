import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The demo business (brief 18, part B): "Harbour Kids Club (Demo)", the one
// row in organizations with is_demo set. The database refuses to publish
// or list it (organizations_demo_never_public), and
// public.reset_demo_business() writes its example data again from scratch.

export const DEMO_SLUG = "harbour-kids-club-demo";

export type DemoBusiness = { id: number; slug: string; name: string; resetAt: string | null };

export async function getDemoBusiness(): Promise<DemoBusiness | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id,slug,name,demo_reset_at").eq("is_demo", true).limit(1).maybeSingle();
  throwIfSupabaseError(error, "Could not load the demo business");
  if (!data) return null;
  remember(Number(data.id));
  return { id: Number(data.id), slug: String(data.slug ?? DEMO_SLUG), name: String(data.name), resetAt: (data.demo_reset_at as string | null) ?? null };
}

// The demo's id, for leaving it out of totals for real businesses. Its row
// is kept across resets, so the id is remembered for a few minutes; "there
// is no demo" is not remembered, so the first reset is seen straight away.
let known: { id: number; at: number } | null = null;
const KNOWN_FOR_MS = 5 * 60_000;

function remember(id: number) {
  known = { id, at: Date.now() };
}

// For a test that changes which row is the demo.
export function forgetDemoBusiness() {
  known = null;
}

export async function demoOrganizationId(): Promise<number | null> {
  if (known && Date.now() - known.at < KNOWN_FOR_MS) return known.id;
  return (await getDemoBusiness())?.id ?? null;
}

// For a total that must not count the demo: a failed lookup is logged and
// counted as "no demo" rather than breaking the screen that asked.
export async function demoOrganizationIdOrNull(): Promise<number | null> {
  try {
    return await demoOrganizationId();
  } catch (error) {
    console.error("demo business lookup", error instanceof Error ? error.message : "");
    return null;
  }
}

// Puts the demo back to its starting point (and makes it, the first time).
export async function resetDemoBusiness(): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("reset_demo_business");
  throwIfSupabaseError(error, "Could not reset the demo business");
  const id = Number(data);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Could not reset the demo business");
  remember(id);
  return id;
}

// The demo's dates are worked out from the day it was last reset, so a demo
// older than a day and a bit has drifted (the nightly job missed it): it is
// written again before anyone is let in. A demo that doesn't exist yet is
// made here.
const STALE_AFTER_MS = 26 * 60 * 60_000;

export async function ensureDemoBusiness(now: number = Date.now()): Promise<DemoBusiness> {
  const current = await getDemoBusiness();
  if (current && current.resetAt && now - new Date(current.resetAt).getTime() < STALE_AFTER_MS) return current;
  await resetDemoBusiness();
  const fresh = await getDemoBusiness();
  if (!fresh) throw new Error("The demo business could not be made");
  return fresh;
}

// The demo's registrations and payment requests, for a total that must not
// count its example money (a payment row names one of these, not a
// business). null when there is no demo, or it could not be read.
export type DemoRecords = { organizationId: number; registrationIds: Set<number>; paymentRequestIds: Set<number> };

export async function demoRecords(): Promise<DemoRecords | null> {
  try {
    const organizationId = await demoOrganizationId();
    if (organizationId === null) return null;
    const db = getSupabaseAdmin();
    const [registrations, requests] = await Promise.all([
      db.from("registrations").select("id").eq("organization_id", organizationId).limit(5000),
      db.from("payment_requests").select("id").eq("organization_id", organizationId).limit(5000),
    ]);
    throwIfSupabaseError(registrations.error, "Could not load the demo's registrations");
    throwIfSupabaseError(requests.error, "Could not load the demo's payment requests");
    return {
      organizationId,
      registrationIds: new Set((registrations.data ?? []).map((row) => Number(row.id))),
      paymentRequestIds: new Set((requests.data ?? []).map((row) => Number(row.id))),
    };
  } catch (error) {
    console.error("demo records lookup", error instanceof Error ? error.message : "");
    return null;
  }
}

export function isDemoPayment(records: DemoRecords | null, row: { registration_id?: unknown; payment_request_id?: unknown }): boolean {
  if (!records) return false;
  return (row.registration_id != null && records.registrationIds.has(Number(row.registration_id))) || (row.payment_request_id != null && records.paymentRequestIds.has(Number(row.payment_request_id)));
}
