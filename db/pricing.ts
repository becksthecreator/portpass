import { unstable_cache } from "next/cache";
import type { PricingAddon, PricingPlan } from "@/lib/pricingFormat";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export const PRICING_TAG = "pricing";

function toPlan(row: Record<string, unknown>): PricingPlan {
  return {
    code: row.code as string,
    name: row.name as string,
    kind: row.kind as PricingPlan["kind"],
    monthlyCents: Number(row.monthly_cents),
    annualMonthsCharged: Number(row.annual_months_charged),
    commissionBps: Number(row.commission_bps),
    blurb: (row.blurb as string | null) ?? null,
    features: Array.isArray(row.features) ? (row.features as unknown[]).filter((f): f is string => typeof f === "string") : [],
    badge: (row.badge as string | null) ?? null,
    isPublic: Boolean(row.is_public),
    sort: Number(row.sort),
    active: Boolean(row.active),
  };
}

function toAddon(row: Record<string, unknown>): PricingAddon {
  return {
    code: row.code as string,
    name: row.name as string,
    amountCents: Number(row.amount_cents),
    unit: row.unit as PricingAddon["unit"],
    note: (row.note as string | null) ?? null,
    group: row.group_code as PricingAddon["group"],
    isPublic: Boolean(row.is_public),
    status: row.status as PricingAddon["status"],
    sort: Number(row.sort),
  };
}

const PLAN_COLUMNS = "code,name,kind,monthly_cents,annual_months_charged,commission_bps,blurb,features,badge,is_public,sort,active";
const ADDON_COLUMNS = "code,name,amount_cents,unit,note,group_code,is_public,status,sort";

async function fetchPlans(): Promise<PricingPlan[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("pricing_plans").select(PLAN_COLUMNS).order("sort", { ascending: true });
  throwIfSupabaseError(error, "Could not load plans");
  return (data ?? []).map(toPlan);
}

async function fetchAddons(): Promise<PricingAddon[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("pricing_addons").select(ADDON_COLUMNS).order("sort", { ascending: true });
  throwIfSupabaseError(error, "Could not load add-ons");
  return (data ?? []).map(toAddon);
}

// Cached under the "pricing" tag: every price on the site reads through
// here, and the admin's save calls revalidateTag("pricing"), so a change
// is live on the next request with no deploy.
const cachedPlans = unstable_cache(fetchPlans, ["pricing-plans"], { tags: [PRICING_TAG] });
const cachedAddons = unstable_cache(fetchAddons, ["pricing-addons"], { tags: [PRICING_TAG] });

export async function listPlans(options: { publicOnly?: boolean; fresh?: boolean; includeInactive?: boolean } = {}): Promise<PricingPlan[]> {
  const plans = options.fresh ? await fetchPlans() : await cachedPlans();
  return plans.filter((p) => (options.includeInactive || p.active) && (!options.publicOnly || p.isPublic));
}

export async function listAddons(options: { publicOnly?: boolean; fresh?: boolean } = {}): Promise<PricingAddon[]> {
  const addons = options.fresh ? await fetchAddons() : await cachedAddons();
  // Public means public *and* adopted: a proposed price never shows.
  return options.publicOnly ? addons.filter((a) => a.isPublic && a.status === "adopted") : addons;
}

export async function getPlan(code: string, options: { fresh?: boolean } = {}): Promise<PricingPlan | null> {
  return (await listPlans({ fresh: options.fresh })).find((p) => p.code === code) ?? null;
}

// The cheapest public subscription, for "from $65/month" lines.
export async function cheapestSubscription(): Promise<PricingPlan | null> {
  const plans = (await listPlans({ publicOnly: true })).filter((p) => p.kind === "subscription" && p.monthlyCents > 0);
  return plans.sort((a, b) => a.monthlyCents - b.monthlyCents)[0] ?? null;
}

export type PlanPatch = Partial<{ name: string; monthlyCents: number; annualMonthsCharged: number; commissionBps: number; blurb: string | null; features: string[]; badge: string | null; isPublic: boolean; active: boolean }>;
export type AddonPatch = Partial<{ name: string; amountCents: number; note: string | null; isPublic: boolean; status: PricingAddon["status"] }>;

export async function updatePlan(code: string, patch: PlanPatch): Promise<PricingPlan> {
  const supabase = getSupabaseAdmin();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.monthlyCents !== undefined) row.monthly_cents = patch.monthlyCents;
  if (patch.annualMonthsCharged !== undefined) row.annual_months_charged = patch.annualMonthsCharged;
  if (patch.commissionBps !== undefined) row.commission_bps = patch.commissionBps;
  if (patch.blurb !== undefined) row.blurb = patch.blurb;
  if (patch.features !== undefined) row.features = patch.features;
  if (patch.badge !== undefined) row.badge = patch.badge;
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.active !== undefined) row.active = patch.active;
  const { data, error } = await supabase.from("pricing_plans").update(row).eq("code", code).select(PLAN_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save plan");
  return toPlan(data!);
}

export async function updateAddon(code: string, patch: AddonPatch): Promise<PricingAddon> {
  const supabase = getSupabaseAdmin();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.status !== undefined) row.status = patch.status;
  const { data, error } = await supabase.from("pricing_addons").update(row).eq("code", code).select(ADDON_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save add-on");
  return toAddon(data!);
}
