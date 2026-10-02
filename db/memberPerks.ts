import { unstable_cache } from "next/cache";
import { nassauToday } from "@/lib/futprepTerms";
import { checkPassCode, passSecret } from "@/lib/memberPass";
import { eligibility, isPerkLive, memberPriceCents, normalizeMemberNumber, type Eligibility, type MemberPerk, type PerkInput, type PerkKind, type PerkStatus } from "@/lib/memberPerks";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Member perks (brief 10). What each caller may see is decided here and in
// the guards in front of it:
//   - the public pages see live perks only, with the business's public details;
//   - a business sees its own perks and its own redemptions, with the
//     member's first name and member number and nothing else about them;
//   - a member sees their own pass and their own redemptions;
//   - platform staff see everything.
// A perk never changes what a customer is charged: the business applies
// it when it takes payment.

export const MEMBER_PERKS_TAG = "member-perks";

type Row = Record<string, unknown>;

const PERK_COLUMNS = "id,organization_id,offering_id,title,kind,percent,amount_cents,addon_text,early_access_hours,first_booking_only,min_spend_cents,starts_on,ends_on,monthly_cap,conditions_text,status,created_at";

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function toPerk(row: Row): MemberPerk {
  return {
    id: Number(row.id), organizationId: Number(row.organization_id), offeringId: numberOrNull(row.offering_id), title: String(row.title), kind: row.kind as PerkKind,
    percent: numberOrNull(row.percent), amountCents: numberOrNull(row.amount_cents), addonText: textOrNull(row.addon_text), earlyAccessHours: numberOrNull(row.early_access_hours),
    firstBookingOnly: Boolean(row.first_booking_only), minSpendCents: numberOrNull(row.min_spend_cents), startsOn: textOrNull(row.starts_on), endsOn: textOrNull(row.ends_on),
    monthlyCap: numberOrNull(row.monthly_cap), conditionsText: textOrNull(row.conditions_text), status: row.status as PerkStatus, createdAt: String(row.created_at),
  };
}

const perkRow = (input: PerkInput) => ({
  offering_id: input.offeringId, title: input.title, kind: input.kind, percent: input.percent, amount_cents: input.amountCents, addon_text: input.addonText, early_access_hours: input.earlyAccessHours,
  first_booking_only: input.firstBookingOnly, min_spend_cents: input.minSpendCents, starts_on: input.startsOn, ends_on: input.endsOn, monthly_cap: input.monthlyCap, conditions_text: input.conditionsText,
});

// ---- A business's own perks ---------------------------------------------------------

// A business's own perks, with why one was ended when PortPass ended it.
export type BusinessPerk = MemberPerk & { endedReason: string | null };

export async function listBusinessPerks(organizationId: number): Promise<BusinessPerk[]> {
  const { data, error } = await getSupabaseAdmin().from("member_perks").select(`${PERK_COLUMNS},ended_reason`).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(200);
  throwIfSupabaseError(error, "Could not load the perks");
  return (data ?? []).map((row) => ({ ...toPerk(row as Row), endedReason: textOrNull((row as Row).ended_reason) }));
}

async function ownPerk(organizationId: number, perkId: number): Promise<MemberPerk> {
  const { data, error } = await getSupabaseAdmin().from("member_perks").select(PERK_COLUMNS).eq("id", perkId).eq("organization_id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the perk");
  if (!data) throw new Error("NOT_FOUND");
  return toPerk(data as Row);
}

// A perk tied to one offering must be this business's offering.
async function assertOffering(organizationId: number, offeringId: number | null): Promise<void> {
  if (offeringId === null) return;
  const { data, error } = await getSupabaseAdmin().from("offerings").select("id").eq("id", offeringId).eq("organization_id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not check the offering");
  if (!data) throw new Error("BAD_OFFERING");
}

// Create a draft, or change one. A perk that is live can't be edited: a
// business must honour what it published, so it ends that perk and
// publishes another.
export async function savePerk(organizationId: number, perkId: number | null, input: PerkInput, actorUserId: string): Promise<MemberPerk> {
  await assertOffering(organizationId, input.offeringId);
  const db = getSupabaseAdmin();
  if (perkId === null) {
    const { data, error } = await db.from("member_perks").insert({ organization_id: organizationId, ...perkRow(input), status: "draft", created_by: actorUserId }).select(PERK_COLUMNS).single();
    throwIfSupabaseError(error, "Could not save the perk");
    const perk = toPerk(data as Row);
    await logAudit({ actorUserId, organizationId, action: "perk.created", targetTable: "member_perks", targetId: perk.id, after: perkRow(input) });
    return perk;
  }
  const before = await ownPerk(organizationId, perkId);
  if (before.status !== "draft") throw new Error("NOT_DRAFT");
  const { data, error } = await db.from("member_perks").update({ ...perkRow(input), updated_at: new Date().toISOString() }).eq("id", perkId).eq("organization_id", organizationId).eq("status", "draft").select(PERK_COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not save the perk");
  if (!data) throw new Error("NOT_DRAFT");
  await logAudit({ actorUserId, organizationId, action: "perk.updated", targetTable: "member_perks", targetId: perkId, before: perkRow(before), after: perkRow(input) });
  return toPerk(data as Row);
}

export async function publishPerk(organizationId: number, perkId: number, actorUserId: string): Promise<MemberPerk> {
  const before = await ownPerk(organizationId, perkId);
  if (before.status !== "draft") throw new Error("NOT_DRAFT");
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin().from("member_perks").update({ status: "live", published_at: now, updated_at: now }).eq("id", perkId).eq("organization_id", organizationId).eq("status", "draft").select(PERK_COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not publish the perk");
  if (!data) throw new Error("NOT_DRAFT");
  await logAudit({ actorUserId, organizationId, action: "perk.published", targetTable: "member_perks", targetId: perkId, before: { status: "draft" }, after: { status: "live", title: before.title } });
  return toPerk(data as Row);
}

// Ending a perk stops it being offered. Redemptions already recorded stay.
// When platform staff end one that breaks the rules, the reason is logged.
export async function endPerk(perkId: number, actorUserId: string, options: { organizationId?: number; reason?: string | null } = {}): Promise<MemberPerk> {
  const db = getSupabaseAdmin();
  let find = db.from("member_perks").select(PERK_COLUMNS).eq("id", perkId);
  if (options.organizationId) find = find.eq("organization_id", options.organizationId);
  const { data: found, error: findError } = await find.maybeSingle();
  throwIfSupabaseError(findError, "Could not load the perk");
  if (!found) throw new Error("NOT_FOUND");
  const before = toPerk(found as Row);
  if (before.status === "ended") throw new Error("ALREADY_ENDED");
  const reason = options.reason?.replace(/\s+/g, " ").trim().slice(0, 300) || null;
  const now = new Date().toISOString();
  const { data, error } = await db.from("member_perks").update({ status: "ended", ended_at: now, ended_reason: reason, updated_at: now }).eq("id", perkId).neq("status", "ended").select(PERK_COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not end the perk");
  if (!data) throw new Error("ALREADY_ENDED");
  await logAudit({ actorUserId, organizationId: before.organizationId, action: "perk.ended", targetTable: "member_perks", targetId: perkId, before: { status: before.status }, after: { status: "ended", reason } });
  return toPerk(data as Row);
}

// ---- The public side ----------------------------------------------------------------

export type PublicPerk = MemberPerk & { businessName: string; businessSlug: string; section: string | null; logoUrl: string | null; brandColor: string | null; publishedAt: string | null };

// Every perk that is live today, on a business that is public, newest
// first: ordered by when the perk was published, never by who pays more.
async function fetchLivePerks(): Promise<PublicPerk[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("member_perks")
    .select(`${PERK_COLUMNS},published_at,organizations!inner(name,slug,primary_category,logo_url,brand_color,status,is_published)`)
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(500);
  throwIfSupabaseError(error, "Could not load live perks");
  const today = nassauToday();
  const perks: PublicPerk[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null; primary_category: string | null; logo_url: string | null; brand_color: string | null; status: string; is_published: boolean } | null;
    // A business whose page isn't published (a draft, one suspended, one
    // still "coming soon") shows no perk: there is nothing to book yet.
    if (!org?.slug || org.status === "suspended" || !org.is_published) continue;
    const perk = toPerk(row);
    if (!isPerkLive(perk, today)) continue;
    perks.push({ ...perk, businessName: org.name, businessSlug: org.slug, section: org.primary_category, logoUrl: org.logo_url, brandColor: org.brand_color, publishedAt: textOrNull(row.published_at) });
  }
  return perks;
}

const cachedLivePerks = unstable_cache(fetchLivePerks, ["member-perks-live"], { tags: [MEMBER_PERKS_TAG], revalidate: 300 });

// Public pages are decoration on top of this: a failed read shows no perks,
// never an error page.
export async function listLivePerks(options: { fresh?: boolean } = {}): Promise<PublicPerk[]> {
  try {
    return options.fresh ? await fetchLivePerks() : await cachedLivePerks();
  } catch (error) {
    if (options.fresh) throw error;
    console.error("member perks read failed, showing none", error instanceof Error ? error.message : "");
    return [];
  }
}

// The one perk a card or a page leads with: the newest that applies to the
// whole business, else the newest of any.
export function leadPerk<T extends MemberPerk>(perks: T[]): T | null {
  return perks.find((perk) => perk.offeringId === null) ?? perks[0] ?? null;
}

export async function livePerksBySlug(): Promise<Map<string, PublicPerk[]>> {
  const bySlug = new Map<string, PublicPerk[]>();
  for (const perk of await listLivePerks()) bySlug.set(perk.businessSlug, [...(bySlug.get(perk.businessSlug) ?? []), perk]);
  return bySlug;
}

// ---- The member ---------------------------------------------------------------------

export type MemberCard = { userId: string; firstName: string; memberNumber: string; memberSince: string };

const firstNameOf = (fullName: unknown): string => (typeof fullName === "string" ? fullName.trim().split(/\s+/)[0] ?? "" : "") || "Member";

export async function getMemberCard(userId: string): Promise<MemberCard | null> {
  const { data, error } = await getSupabaseAdmin().from("profiles").select("user_id,full_name,member_number,created_at").eq("user_id", userId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the member");
  return data ? { userId: String(data.user_id), firstName: firstNameOf(data.full_name), memberNumber: String(data.member_number), memberSince: String(data.created_at) } : null;
}

export type MemberRedemption = { id: number; businessName: string; perkTitle: string; redeemedAt: string; discountCents: number | null };

export async function listMemberRedemptions(userId: string): Promise<MemberRedemption[]> {
  const { data, error } = await getSupabaseAdmin().from("perk_redemptions").select("id,redeemed_at,discount_cents,member_perks(title),organizations(name)").eq("profile_id", userId).order("redeemed_at", { ascending: false }).limit(100);
  throwIfSupabaseError(error, "Could not load your perks");
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const perk = (Array.isArray(row.member_perks) ? row.member_perks[0] : row.member_perks) as { title: string } | null;
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string } | null;
    return { id: Number(row.id), businessName: org?.name ?? "", perkTitle: perk?.title ?? "", redeemedAt: String(row.redeemed_at), discountCents: numberOrNull(row.discount_cents) };
  });
}

// ---- The counter: checking a pass, recording a use ------------------------------------

// How many times this perk has been used: by this member ever, and by
// anyone this month (Nassau's calendar month, near enough in UTC).
async function usage(perkId: number, profileId: string): Promise<{ byThisMember: number; thisMonth: number }> {
  const db = getSupabaseAdmin();
  const monthStart = `${nassauToday().slice(0, 7)}-01T00:00:00-05:00`;
  const [mine, month] = await Promise.all([
    db.from("perk_redemptions").select("id", { count: "exact", head: true }).eq("perk_id", perkId).eq("profile_id", profileId),
    db.from("perk_redemptions").select("id", { count: "exact", head: true }).eq("perk_id", perkId).gte("redeemed_at", monthStart),
  ]);
  throwIfSupabaseError(mine.error, "Could not count the member's uses");
  throwIfSupabaseError(month.error, "Could not count this month's uses");
  return { byThisMember: mine.count ?? 0, thisMonth: month.count ?? 0 };
}

export type PassCheck =
  | { valid: false }
  // Everything a business learns about a member: a first name, their
  // member number, and which of this business's perks they can have.
  | { valid: true; firstName: string; memberNumber: string; perks: Array<{ perk: MemberPerk; eligibility: Eligibility }> };

// "Not valid" says nothing more: a wrong number and a wrong code look the same.
export async function checkMemberPass(organizationId: number, typedNumber: string, typedCode: string, now: number = Date.now()): Promise<PassCheck> {
  const memberNumber = normalizeMemberNumber(typedNumber);
  if (!memberNumber) return { valid: false };
  // The code is checked whether or not the number exists, so both take as long.
  const codeOk = checkPassCode(passSecret(), memberNumber, typedCode, now);
  const { data, error } = await getSupabaseAdmin().from("profiles").select("user_id,full_name,member_number").eq("member_number", memberNumber).maybeSingle();
  throwIfSupabaseError(error, "Could not check the pass");
  if (!data || !codeOk) return { valid: false };
  const today = nassauToday();
  const live = (await listBusinessPerks(organizationId)).filter((perk) => isPerkLive(perk, today));
  const perks = await Promise.all(live.map(async (perk) => ({ perk, eligibility: eligibility(perk, today, await usage(perk.id, String(data.user_id))) })));
  return { valid: true, firstName: firstNameOf(data.full_name), memberNumber, perks };
}

export type RedemptionInput = { method: "online" | "pass_scan"; bookingRef: string | null; priceCents: number | null; recordedBy: string | null };

// One use of a perk by one member. The pass must already have been checked
// (the caller holds the member's number from a valid check, or the member
// is signed in). "First booking only" is kept by the database as well, so
// two tills can't both record it.
export async function recordRedemption(organizationId: number, perkId: number, memberNumber: string, input: RedemptionInput): Promise<{ id: number; discountCents: number | null }> {
  const db = getSupabaseAdmin();
  const perk = await ownPerk(organizationId, perkId);
  const { data: member, error: memberError } = await db.from("profiles").select("user_id").eq("member_number", memberNumber).maybeSingle();
  throwIfSupabaseError(memberError, "Could not find the member");
  if (!member) throw new Error("NOT_A_MEMBER");
  const profileId = String(member.user_id);
  const check = eligibility(perk, nassauToday(), await usage(perkId, profileId));
  if (!check.eligible) throw new Error(check.reason === "already_used" ? "ALREADY_USED" : check.reason === "month_full" ? "MONTH_FULL" : "NOT_LIVE");
  if (perk.minSpendCents && input.priceCents !== null && input.priceCents < perk.minSpendCents) throw new Error("BELOW_MINIMUM");
  const member_price = input.priceCents === null ? null : memberPriceCents(input.priceCents, perk);
  const discountCents = input.priceCents !== null && member_price !== null ? input.priceCents - member_price : null;
  const { data, error } = await db
    .from("perk_redemptions")
    .insert({ perk_id: perkId, profile_id: profileId, organization_id: organizationId, booking_ref: input.bookingRef ? input.bookingRef.slice(0, 80) : null, method: input.method, discount_cents: discountCents, first_booking: perk.firstBookingOnly, recorded_by: input.recordedBy ? input.recordedBy.slice(0, 80) : null })
    .select("id")
    .single();
  if (error && (error as { code?: string }).code === "23505") throw new Error("ALREADY_USED");
  throwIfSupabaseError(error, "Could not record the perk");
  return { id: Number(data!.id), discountCents };
}

export type BusinessRedemption = { id: number; perkTitle: string; firstName: string; memberNumber: string | null; redeemedAt: string; method: string; bookingRef: string | null; discountCents: number | null };

// A business's redemptions: the member's first name and member number,
// never their email, phone or surname.
export async function listBusinessRedemptions(organizationId: number): Promise<BusinessRedemption[]> {
  const { data, error } = await getSupabaseAdmin().from("perk_redemptions").select("id,redeemed_at,method,booking_ref,discount_cents,member_perks(title),profiles(full_name,member_number)").eq("organization_id", organizationId).order("redeemed_at", { ascending: false }).limit(200);
  throwIfSupabaseError(error, "Could not load the redemptions");
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const perk = (Array.isArray(row.member_perks) ? row.member_perks[0] : row.member_perks) as { title: string } | null;
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { full_name: string; member_number: string } | null;
    return { id: Number(row.id), perkTitle: perk?.title ?? "", firstName: profile ? firstNameOf(profile.full_name) : "A former member", memberNumber: profile?.member_number ?? null, redeemedAt: String(row.redeemed_at), method: String(row.method), bookingRef: textOrNull(row.booking_ref), discountCents: numberOrNull(row.discount_cents) };
  });
}

// ---- Platform staff -------------------------------------------------------------------

export type AdminPerk = MemberPerk & { businessName: string; redemptions: number };

export async function listAllPerks(): Promise<AdminPerk[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("member_perks").select(`${PERK_COLUMNS},organizations(name)`).order("created_at", { ascending: false }).limit(1000);
  throwIfSupabaseError(error, "Could not load perks");
  const perks = (data ?? []) as unknown as Row[];
  const counts = new Map<number, number>();
  await Promise.all(
    perks.map(async (row) => {
      const { count, error: countError } = await db.from("perk_redemptions").select("id", { count: "exact", head: true }).eq("perk_id", Number(row.id));
      throwIfSupabaseError(countError, "Could not count redemptions");
      counts.set(Number(row.id), count ?? 0);
    }),
  );
  return perks.map((row) => {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string } | null;
    return { ...toPerk(row), businessName: org?.name ?? "", redemptions: counts.get(Number(row.id)) ?? 0 };
  });
}

// ---- Guessing a pass ------------------------------------------------------------------

// A business may get this many checks wrong in ten minutes before it has
// to wait. Counted in the database, so it holds whichever server answers.
export const PASS_CHECK_FAILURES_ALLOWED = 8;
const PASS_CHECK_WINDOW_MS = 10 * 60 * 1000;

export async function passChecksBlocked(organizationId: number, now: number = Date.now()): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from("member_pass_checks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("ok", false)
    .gte("checked_at", new Date(now - PASS_CHECK_WINDOW_MS).toISOString());
  throwIfSupabaseError(error, "Could not count pass checks");
  return (count ?? 0) >= PASS_CHECK_FAILURES_ALLOWED;
}

export async function logPassCheck(organizationId: number, checkedBy: string, ok: boolean): Promise<void> {
  const { error } = await getSupabaseAdmin().from("member_pass_checks").insert({ organization_id: organizationId, checked_by: checkedBy, ok });
  throwIfSupabaseError(error, "Could not record the pass check");
}

// Called by the daily job: pass checks are kept 30 days.
export async function prunePassChecks(now: number = Date.now()): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("member_pass_checks").delete({ count: "exact" }).lt("checked_at", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString());
  throwIfSupabaseError(error, "Could not prune pass checks");
  return count ?? 0;
}

// ---- Early access ---------------------------------------------------------------------

// How many hours before the public a member may book with this business:
// the longest of its live early-access perks that cover the whole
// business, or null when it has none.
export async function memberEarlyAccess(organizationId: number): Promise<{ perkId: number; hours: number } | null> {
  const today = nassauToday();
  const perks = (await listBusinessPerks(organizationId)).filter((perk) => perk.kind === "early_access" && perk.offeringId === null && perk.earlyAccessHours && isPerkLive(perk, today));
  const best = perks.sort((a, b) => (b.earlyAccessHours ?? 0) - (a.earlyAccessHours ?? 0))[0];
  return best ? { perkId: best.id, hours: best.earlyAccessHours as number } : null;
}

// A booking a signed-in member made online with their perk (today: a
// place booked in the members-only early window). Never fails the booking
// it follows: the caller logs and moves on.
export async function recordOnlineRedemption(organizationId: number, perkId: number, userId: string, bookingRef: string): Promise<void> {
  const perk = await ownPerk(organizationId, perkId);
  const { error } = await getSupabaseAdmin().from("perk_redemptions").insert({ perk_id: perkId, profile_id: userId, organization_id: organizationId, booking_ref: bookingRef.slice(0, 80), method: "online", discount_cents: null, first_booking: perk.firstBookingOnly, recorded_by: "online" });
  if (error && (error as { code?: string }).code === "23505") return;
  throwIfSupabaseError(error, "Could not record the perk");
}

// ---- Sign-ups -------------------------------------------------------------------------

// Set once, when the account is made; never changed afterwards.
export async function setSignupSource(userId: string, source: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("profiles").update({ signup_source: source }).eq("user_id", userId).is("signup_source", null);
  throwIfSupabaseError(error, "Could not record the sign-up source");
}

export type PerkStats = { signUps: number; bySource: Array<{ source: string | null; count: number }>; redemptions: number; livePerks: number };

// The Overview tile: sign-ups since a moment, where they came from, and
// perk redemptions since the same moment.
export async function getPerkStats(sinceIso: string): Promise<PerkStats> {
  const db = getSupabaseAdmin();
  const [profiles, redemptions, live] = await Promise.all([
    db.from("profiles").select("signup_source").gte("created_at", sinceIso).limit(5000),
    db.from("perk_redemptions").select("id", { count: "exact", head: true }).gte("redeemed_at", sinceIso),
    db.from("member_perks").select("id", { count: "exact", head: true }).eq("status", "live"),
  ]);
  throwIfSupabaseError(profiles.error, "Could not load sign-ups");
  throwIfSupabaseError(redemptions.error, "Could not count redemptions");
  throwIfSupabaseError(live.error, "Could not count live perks");
  const counts = new Map<string | null, number>();
  for (const row of profiles.data ?? []) {
    const source = (row.signup_source as string | null) ?? null;
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const bySource = [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count || String(a.source).localeCompare(String(b.source)));
  return { signUps: (profiles.data ?? []).length, bySource, redemptions: redemptions.count ?? 0, livePerks: live.count ?? 0 };
}
