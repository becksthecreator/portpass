import { createHash, randomBytes } from "node:crypto";
import { upsertMembership } from "./accounts";
import { logAudit } from "./audit";
import { createDraftBusiness, getBusiness, listBusinessOfferings, submissionProblems, updateBusinessDetails, type Business } from "./business";
import { linkLeadToDraft, markLeadsLive } from "./leadLinks";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { hasOwnPages } from "@/lib/orgWorkspaces";
import { bumpListings } from "@/lib/revalidate";

// Admin Control Center, Businesses (brief 08, 1.2 and 1.3): what a founder
// can do to a listing. Every action is audit-logged with who did it; the
// routes that call these are behind requireAdminApi (platform role plus
// the authenticator step).
//
// The states: draft -> submitted -> approved -> live, or suspended.
// "approved" becomes "live" the moment the business has a priced offering
// (a database trigger refuses to publish without one), which is why
// approving and publishing both go through goLiveIfPriced.

const db = () => getSupabaseAdmin();

async function requireBusiness(id: number): Promise<Business> {
  const business = await getBusiness(id);
  if (!business) throw new Error("NOT_FOUND");
  return business;
}

async function hasPricedOffering(id: number): Promise<boolean> {
  return (await listBusinessOfferings(id)).some((o) => o.isPublished && o.priceCents !== null);
}

async function goLiveIfPriced(id: number, actorUserId: string): Promise<boolean> {
  if (!(await hasPricedOffering(id))) return false;
  const { data, error } = await db().from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", id).eq("status", "approved").select("id").maybeSingle();
  throwIfSupabaseError(error, "Could not publish the business");
  // The status moved in between (a suspend, an owner's edit): nothing went live.
  if (!data) return false;
  await logAudit({ actorUserId, organizationId: id, action: "business.went_live", targetTable: "organizations", targetId: id });
  await markLeadsLive(id, actorUserId);
  return true;
}

// By the time this runs the approval is saved and logged. If going live
// fails, the business stays "approved" (it goes live with its next priced
// offering) and the founder is told that, not that nothing happened.
async function tryGoLive(id: number, actorUserId: string): Promise<void> {
  try {
    await goLiveIfPriced(id, actorUserId);
  } catch (error) {
    console.error("business approved but not live yet", error instanceof Error ? error.message : "");
  }
}

// What a change of needs a fresh review: the name, the category and the
// bank details. Kept as a fingerprint so a suspension can tell whether any
// of them changed while the page was hidden.
function reviewFingerprint(row: { name?: unknown; subcategory?: unknown; bank_transfer_details?: unknown }): string {
  return createHash("sha256").update(JSON.stringify([row.name ?? null, row.subcategory ?? null, row.bank_transfer_details ?? null])).digest("hex");
}

async function ownerCount(id: number): Promise<number> {
  const { count, error } = await db().from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", id).eq("role", "org_owner");
  throwIfSupabaseError(error, "Could not check the business's owners");
  return count ?? 0;
}

// Approve a submitted business. It goes live at once if it already has a
// priced offering; otherwise it waits as "approved" and goes live when
// the first price is added.
export async function approveBusiness(id: number, actorUserId: string): Promise<Business> {
  const business = await requireBusiness(id);
  if (business.status !== "submitted") throw new Error("NOT_SUBMITTED");
  const { data, error } = await db()
    .from("organizations")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: actorUserId, review_note: null })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not approve the business");
  if (!data) throw new Error("NOT_SUBMITTED");
  await logAudit({ actorUserId, organizationId: id, action: "business.approved", targetTable: "organizations", targetId: id, before: { status: "submitted" }, after: { status: "approved" } });
  await tryGoLive(id, actorUserId);
  bumpListings();
  return requireBusiness(id);
}

// Publish a business PortPass built for an owner (concierge). The owner
// has said yes, by phone or WhatsApp, so there is no submission to
// approve: the audit entry records that it was published on their word.
export async function publishForOwner(id: number, actorUserId: string): Promise<Business> {
  const business = await requireBusiness(id);
  if (business.status !== "draft" && business.status !== "submitted") throw new Error("NOT_PUBLISHABLE");
  const problems = submissionProblems(business, await listBusinessOfferings(id));
  if (problems.length) {
    const error = new Error("INCOMPLETE") as Error & { problems: string[] };
    error.problems = problems;
    throw error;
  }
  const { data, error } = await db()
    .from("organizations")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: actorUserId, review_note: null })
    .eq("id", id)
    .in("status", ["draft", "submitted"])
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not publish the business");
  if (!data) throw new Error("NOT_PUBLISHABLE");
  await logAudit({ actorUserId, organizationId: id, action: "business.published_for_owner", targetTable: "organizations", targetId: id, before: { status: business.status }, after: { status: "approved", owner_agreed: "verbal OK recorded by the founder" } });
  await tryGoLive(id, actorUserId);
  bumpListings();
  return requireBusiness(id);
}

// Publish a business that is approved but not public (brief 18, G1): one
// button for a page PortPass has ready and the owner has now said yes to.
// It sets is_published and is_directory_listed, so no migration is needed
// on the day. The database still refuses a page with no priced offering.
export async function publishApprovedBusiness(id: number, actorUserId: string): Promise<Business> {
  const business = await requireBusiness(id);
  if (business.status !== "approved" || business.isPublished) throw new Error("NOT_APPROVED");
  if (!(await hasPricedOffering(id))) throw new Error("NEEDS_PRICE");
  const { data, error } = await db()
    .from("organizations")
    .update({ is_published: true, is_directory_listed: true, status: "live" })
    .eq("id", id)
    .eq("status", "approved")
    .eq("is_published", false)
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not publish the business");
  if (!data) throw new Error("NOT_APPROVED");
  await logAudit({ actorUserId, organizationId: id, action: "business.published", targetTable: "organizations", targetId: id, before: { status: "approved", is_published: false }, after: { status: "live", is_published: true, is_directory_listed: true, owner_agreed: "confirmed by the founder who pressed Publish" } });
  await markLeadsLive(id, actorUserId);
  bumpListings();
  return requireBusiness(id);
}

// Send a submitted business back to its owner with a note saying what to
// change. It returns to draft; the note shows on the owner's dashboard.
export async function sendBackBusiness(id: number, note: string, actorUserId: string): Promise<Business> {
  const text = note.trim().slice(0, 1000);
  if (!text) throw new Error("NOTE_REQUIRED");
  const { data: row, error: loadError } = await db().from("organizations").select("status,is_published,is_directory_listed").eq("id", id).maybeSingle();
  throwIfSupabaseError(loadError, "Could not load the business");
  if (!row) throw new Error("NOT_FOUND");
  if (row.status !== "submitted") throw new Error("NOT_SUBMITTED");
  // A live page whose change is waiting for review is still public. A
  // "draft" must never be public, so that one is approved or suspended,
  // not sent back.
  if (row.is_published || row.is_directory_listed) throw new Error("STILL_PUBLIC");
  const { data, error } = await db().from("organizations").update({ status: "draft", review_note: text }).eq("id", id).eq("status", "submitted").eq("is_published", false).select("id").maybeSingle();
  throwIfSupabaseError(error, "Could not send the business back");
  if (!data) throw new Error("NOT_SUBMITTED");
  await logAudit({ actorUserId, organizationId: id, action: "business.sent_back", targetTable: "organizations", targetId: id, before: { status: "submitted" }, after: { status: "draft", note: text } });
  return requireBusiness(id);
}

type SuspendedFrom = { status?: string; is_published?: boolean; is_directory_listed?: boolean; review?: string };

// Suspend: the listing leaves every public page at once (both visibility
// switches go off, not only the status), and what it looked like before
// is remembered so unsuspending puts it back. Anything that is public or
// in the review queue can be suspended, including a live page with a
// change waiting.
export async function suspendBusiness(id: number, reason: string, actorUserId: string): Promise<Business> {
  const text = reason.trim().slice(0, 1000);
  if (!text) throw new Error("REASON_REQUIRED");
  const { data: row, error: loadError } = await db().from("organizations").select("slug,name,subcategory,bank_transfer_details,status,is_published,is_directory_listed").eq("id", id).maybeSingle();
  throwIfSupabaseError(loadError, "Could not load the business");
  if (!row) throw new Error("NOT_FOUND");
  if (hasOwnPages(row.slug as string | null)) throw new Error("OWN_PAGES");
  const isPublic = Boolean(row.is_published) || Boolean(row.is_directory_listed);
  if (row.status === "suspended" || !(row.status === "submitted" || row.status === "approved" || row.status === "live" || isPublic)) throw new Error("NOT_SUSPENDABLE");
  const from: SuspendedFrom = { status: row.status as string, is_published: Boolean(row.is_published), is_directory_listed: Boolean(row.is_directory_listed), review: reviewFingerprint(row) };
  const { data, error } = await db()
    .from("organizations")
    .update({ status: "suspended", is_published: false, is_directory_listed: false, suspended_at: new Date().toISOString(), suspended_reason: text, suspended_from: from })
    .eq("id", id)
    .eq("status", row.status as string)
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not suspend the business");
  if (!data) throw new Error("NOT_SUSPENDABLE");
  await logAudit({ actorUserId, organizationId: id, action: "business.suspended", targetTable: "organizations", targetId: id, before: { status: from.status, is_published: from.is_published, is_directory_listed: from.is_directory_listed }, after: { status: "suspended", reason: text } });
  bumpListings();
  return requireBusiness(id);
}

// Unsuspend puts the page back as it was, in one write. Two exceptions,
// both on the careful side: a page that had a change waiting for review
// (or whose name, category or bank details changed while it was hidden)
// comes back in the review queue, not public; and a page that was live
// but no longer has a priced offering comes back approved, not live.
export async function unsuspendBusiness(id: number, actorUserId: string): Promise<Business> {
  const { data: row, error: loadError } = await db().from("organizations").select("name,subcategory,bank_transfer_details,status,suspended_from").eq("id", id).maybeSingle();
  throwIfSupabaseError(loadError, "Could not load the business");
  if (!row) throw new Error("NOT_FOUND");
  if (row.status !== "suspended") throw new Error("NOT_SUSPENDED");
  const from = (row.suspended_from ?? {}) as SuspendedFrom;
  const changedWhileHidden = typeof from.review === "string" && from.review !== reviewFingerprint(row);
  let restore: { status: string; is_published: boolean; is_directory_listed: boolean; submitted_at?: string };
  if (from.status === "draft") {
    restore = { status: "draft", is_published: false, is_directory_listed: false };
  } else if (from.status === "submitted" || changedWhileHidden) {
    restore = { status: "submitted", is_published: false, is_directory_listed: false, submitted_at: new Date().toISOString() };
  } else if (from.is_published) {
    restore = (await hasPricedOffering(id)) ? { status: "live", is_published: true, is_directory_listed: true } : { status: "approved", is_published: false, is_directory_listed: false };
  } else {
    restore = { status: from.status === "live" ? "live" : "approved", is_published: false, is_directory_listed: Boolean(from.is_directory_listed) };
  }
  const { data, error } = await db().from("organizations").update({ ...restore, suspended_at: null, suspended_reason: null, suspended_from: null }).eq("id", id).eq("status", "suspended").select("id").maybeSingle();
  throwIfSupabaseError(error, "Could not unsuspend the business");
  if (!data) throw new Error("NOT_SUSPENDED");
  await logAudit({ actorUserId, organizationId: id, action: "business.unsuspended", targetTable: "organizations", targetId: id, before: { status: "suspended" }, after: { status: restore.status, is_published: restore.is_published, is_directory_listed: restore.is_directory_listed } });
  bumpListings();
  return requireBusiness(id);
}

// ---- Applications inbox: "Create draft business from this" ------------------------

// Turns a get listed request into a draft business, prefilled with what
// the form collected, ready for the setup wizard. The request is marked
// approved and linked, so it can't be turned into a second business.
export async function draftBusinessFromApplication(applicationId: number, actorUserId: string): Promise<Business> {
  const { data: application, error } = await db().from("applications").select("id,status,organization_name,contact_person,section,whatsapp_e164,phone,instagram_handle").eq("id", applicationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the application");
  if (!application) throw new Error("NOT_FOUND");
  if (application.status !== "submitted") throw new Error("ALREADY_REVIEWED");
  if (!application.section) throw new Error("SECTION_REQUIRED");

  // Claim the request first, so two clicks can't make two businesses.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await db().from("applications").update({ status: "approved", reviewed_at: now }).eq("id", applicationId).eq("status", "submitted").select("id").maybeSingle();
  throwIfSupabaseError(claimError, "Could not review the application");
  if (!claimed) throw new Error("ALREADY_REVIEWED");

  // If the draft can't be made and linked, the request goes back to the
  // inbox rather than sitting "approved" with nothing behind it.
  let business: Business;
  try {
    business = await createDraftBusiness({ name: String(application.organization_name), section: String(application.section), subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId });
    const { error: linkError } = await db().from("organizations").update({ application_id: applicationId, primary_contact: application.contact_person ?? null }).eq("id", business.id);
    throwIfSupabaseError(linkError, "Could not link the business to its application");
  } catch (failure) {
    await db().from("applications").update({ status: "submitted", reviewed_at: null }).eq("id", applicationId).eq("status", "approved");
    throw failure;
  }
  await linkLeadToDraft(applicationId, business.id, actorUserId);
  const whatsapp = (application.whatsapp_e164 as string | null) ?? null;
  const instagram = (application.instagram_handle as string | null) ?? null;
  if (whatsapp || instagram) {
    await updateBusinessDetails(business.id, { ...(whatsapp ? { whatsappE164: whatsapp } : {}), ...(instagram ? { instagramHandle: instagram } : {}), ...(application.contact_person ? { ownerName: String(application.contact_person) } : {}) }, actorUserId);
  }
  await logAudit({ actorUserId, organizationId: business.id, action: "application.drafted", targetTable: "applications", targetId: applicationId, after: { organization_id: business.id, slug: business.slug } });
  return requireBusiness(business.id);
}

// ---- Claim links -----------------------------------------------------------------

export const CLAIM_LINK_DAYS = 30;

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// A fresh one-use link for the business's owner. Earlier unused links for
// the same business stop working, so only the latest one sent is live.
export async function createClaimLink(id: number, actorUserId: string): Promise<{ token: string; expiresAt: string }> {
  const business = await requireBusiness(id);
  if (business.claimedAt) throw new Error("ALREADY_CLAIMED");
  // Only for a page PortPass built that nobody owns yet: the link makes
  // whoever opens it the owner, so it is never made for a business that
  // has one, however it got one.
  if (!business.createdByAdmin || business.status === "suspended") throw new Error("NOT_CLAIMABLE");
  if ((await ownerCount(id)) > 0) throw new Error("ALREADY_CLAIMED");
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + CLAIM_LINK_DAYS * 24 * 3600_000).toISOString();
  const { error: clearError } = await db().from("organization_claim_links").delete().eq("organization_id", id).is("claimed_at", null);
  throwIfSupabaseError(clearError, "Could not replace the earlier claim link");
  const { error } = await db().from("organization_claim_links").insert({ organization_id: id, token_hash: hashClaimToken(token), expires_at: expiresAt, created_by: actorUserId });
  throwIfSupabaseError(error, "Could not create the claim link");
  await logAudit({ actorUserId, organizationId: id, action: "business.claim_link_created", targetTable: "organizations", targetId: id, after: { expires_at: expiresAt } });
  return { token, expiresAt };
}

export type ClaimLink = { organizationId: number; businessName: string; slug: string | null; state: "open" | "used" | "expired"; claimedBy: string | null };

export async function claimLinkInfo(token: string): Promise<ClaimLink | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const { data, error } = await db().from("organization_claim_links").select("organization_id,expires_at,claimed_at,claimed_by,organizations(name,slug,claimed_at)").eq("token_hash", hashClaimToken(token)).maybeSingle();
  throwIfSupabaseError(error, "Could not check the claim link");
  if (!data) return null;
  const organization = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as { name: string; slug: string | null; claimed_at: string | null } | null;
  // A business that got its owner another way (an invitation) has no use
  // for the link either: it reads as used.
  const state = data.claimed_at || organization?.claimed_at ? "used" : Date.parse(String(data.expires_at)) < Date.now() ? "expired" : "open";
  return { organizationId: Number(data.organization_id), businessName: organization?.name ?? "this business", slug: organization?.slug ?? null, state, claimedBy: (data.claimed_by as string | null) ?? null };
}

// The signed-in person becomes the business's owner. The link is marked
// used in the same statement that checks it is still open, so it cannot be
// used twice.
export async function claimBusiness(token: string, userId: string): Promise<{ organizationId: number; slug: string | null }> {
  const link = await claimLinkInfo(token);
  if (!link) throw new Error("NOT_FOUND");
  if (link.state === "used" && link.claimedBy === userId) {
    // The same person again (a second tap, or a retry after an error):
    // if the business is already theirs, take them to it. Nothing is granted here.
    const { data: mine, error: mineError } = await db().from("organization_members").select("role").eq("organization_id", link.organizationId).eq("user_id", userId).maybeSingle();
    throwIfSupabaseError(mineError, "Could not check the membership");
    if (mine?.role === "org_owner") return { organizationId: link.organizationId, slug: link.slug };
  }
  if (link.state !== "open") throw new Error(link.state === "used" ? "ALREADY_USED" : "EXPIRED");
  const hash = hashClaimToken(token);
  const { data, error } = await db()
    .from("organization_claim_links")
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error, "Could not use the claim link");
  if (!data) throw new Error("ALREADY_USED");
  // The business itself is the gate: only the first claim of a business
  // with no owner succeeds, whatever links exist.
  const { data: gate, error: gateError } = await db().from("organizations").update({ claimed_at: new Date().toISOString() }).eq("id", link.organizationId).is("claimed_at", null).select("id").maybeSingle();
  throwIfSupabaseError(gateError, "Could not claim the business");
  if (!gate || (await ownerCount(link.organizationId)) > 0) throw new Error("ALREADY_USED");
  try {
    await upsertMembership({ organizationId: link.organizationId, userId, role: "org_owner", canViewMedical: true });
  } catch (failure) {
    // Nothing was granted: hand the link back so the owner can try again.
    await db().from("organizations").update({ claimed_at: null }).eq("id", link.organizationId);
    await db().from("organization_claim_links").update({ claimed_by: null, claimed_at: null }).eq("token_hash", hash).eq("claimed_by", userId);
    throw failure;
  }
  await logAudit({ actorUserId: userId, organizationId: link.organizationId, action: "business.claimed", targetTable: "organizations", targetId: link.organizationId });
  return { organizationId: link.organizationId, slug: link.slug };
}
