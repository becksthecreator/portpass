import { bumpListings } from "@/lib/revalidate";
import { createHash, randomBytes } from "node:crypto";
import { upsertMembership, type OrgRole } from "./accounts";
import { logAudit } from "./audit";
import { listCategories } from "./categories";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { isReservedSlug, isValidSlug } from "@/lib/reservedSlugs";
import { slugify } from "@/lib/slug";

// Everything the owner setup wizard and /business/[slug]/settings read and
// write. Access control lives in the route handlers (lib/auth/guards.ts);
// this module trusts its callers and only enforces data rules: slugs that
// can't collide, offerings that can't publish without a price, and the
// re-review rule for name/category/payment changes on a live listing.

export type BankTransferDetails = {
  bank: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  instructions: string;
};

export type Business = {
  id: number;
  slug: string | null;
  name: string;
  primaryCategory: string | null;
  subcategory: string | null;
  island: string | null;
  area: string | null;
  oneLiner: string | null;
  description: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  publicEmail: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  brandColor: string | null;
  ownerName: string | null;
  ownerBio: string | null;
  paymentMethods: string[];
  bankTransferDetails: BankTransferDetails | null;
  status: "draft" | "submitted" | "approved" | "live" | "suspended";
  isPublished: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  createdByAdmin: boolean;
  claimedAt: string | null;
  photoConsentRequired: boolean;
  // What PortPass asked the owner to change when it sent the page back.
  reviewNote: string | null;
};

const BUSINESS_COLUMNS =
  "id,slug,name,primary_category,subcategory,island,area,one_liner,description,phone_e164,whatsapp_e164,public_email,website_url,instagram_handle,logo_url,hero_image_url,brand_color,owner_name,owner_bio,payment_methods,bank_transfer_details,status,is_published,submitted_at,approved_at,created_by_admin,claimed_at,photo_consent_required,review_note";

function toBusiness(row: Record<string, unknown>): Business {
  const bank = row.bank_transfer_details as Partial<BankTransferDetails> | null;
  return {
    id: Number(row.id),
    slug: (row.slug as string | null) ?? null,
    name: row.name as string,
    primaryCategory: (row.primary_category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    island: (row.island as string | null) ?? null,
    area: (row.area as string | null) ?? null,
    oneLiner: (row.one_liner as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    whatsappE164: (row.whatsapp_e164 as string | null) ?? null,
    publicEmail: (row.public_email as string | null) ?? null,
    websiteUrl: (row.website_url as string | null) ?? null,
    instagramHandle: (row.instagram_handle as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    heroImageUrl: (row.hero_image_url as string | null) ?? null,
    brandColor: (row.brand_color as string | null) ?? null,
    ownerName: (row.owner_name as string | null) ?? null,
    ownerBio: (row.owner_bio as string | null) ?? null,
    paymentMethods: Array.isArray(row.payment_methods) ? (row.payment_methods as string[]) : [],
    bankTransferDetails: bank
      ? {
          bank: bank.bank ?? "",
          accountName: bank.accountName ?? "",
          accountNumber: bank.accountNumber ?? "",
          branch: bank.branch ?? "",
          instructions: bank.instructions ?? "",
        }
      : null,
    status: (row.status as Business["status"]) ?? "draft",
    isPublished: Boolean(row.is_published),
    submittedAt: (row.submitted_at as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    createdByAdmin: Boolean(row.created_by_admin),
    claimedAt: (row.claimed_at as string | null) ?? null,
    photoConsentRequired: Boolean(row.photo_consent_required),
    reviewNote: (row.review_note as string | null) ?? null,
  };
}

export async function getBusiness(id: number): Promise<Business | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organizations").select(BUSINESS_COLUMNS).eq("id", id).maybeSingle();
  throwIfSupabaseError(error, "Could not load business");
  return data ? toBusiness(data) : null;
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organizations").select(BUSINESS_COLUMNS).eq("slug", slug).maybeSingle();
  throwIfSupabaseError(error, "Could not load business");
  return data ? toBusiness(data) : null;
}

// The unfinished business this owner should be sent back to.
export async function findDraftForUser(userId: string): Promise<Business | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,organizations!inner(status)")
    .eq("user_id", userId)
    .eq("role", "org_owner")
    .in("organizations.status", ["draft", "submitted"])
    .order("id", { ascending: true })
    .limit(1);
  throwIfSupabaseError(error, "Could not look up draft business");
  const row = (data ?? [])[0];
  return row ? getBusiness(Number(row.organization_id)) : null;
}

// A slug that is valid, not a reserved route name, not a subcategory in
// the same section (public URLs resolve subcategory-first) and not taken.
export async function uniqueBusinessSlug(name: string, section: string | null): Promise<string> {
  const supabase = getSupabaseAdmin();
  let base = slugify(name);
  if (base === "program" || !isValidSlug(base)) base = "business";
  const categories = await listCategories().catch(() => []);
  const sectionId = categories.find((c) => c.slug === section && c.parentId === null)?.id ?? null;
  const subcategorySlugs = new Set(categories.filter((c) => c.parentId !== null && c.parentId === sectionId).map((c) => c.slug));
  const { data, error } = await supabase.from("organizations").select("slug").like("slug", `${base}%`);
  throwIfSupabaseError(error, "Could not check slugs");
  const taken = new Set((data ?? []).map((row) => row.slug as string));
  for (let i = 1; i < 1000; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(candidate) && !subcategorySlugs.has(candidate) && !isReservedSlug(candidate, "second") && !isReservedSlug(candidate, "top")) {
      return candidate;
    }
  }
  throw new Error("Could not find a free slug");
}

export async function createDraftBusiness(input: {
  name: string;
  section: string;
  subcategory: string | null;
  ownerUserId: string | null;
  createdByAdmin?: boolean;
  actorUserId: string;
}): Promise<Business> {
  const supabase = getSupabaseAdmin();
  const slug = await uniqueBusinessSlug(input.name, input.section);
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: input.name.trim(),
      slug,
      primary_category: input.section,
      subcategory: input.subcategory,
      status: "draft",
      created_by_admin: input.createdByAdmin ?? false,
      // Youth sport is where children's photos come from; admins can flip
      // this either way for any business.
      photo_consent_required: input.section === "sports-fitness",
      created_at: new Date().toISOString(),
    })
    .select(BUSINESS_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not create business");
  if (!data) throw new Error("Could not create business");
  const business = toBusiness(data);
  if (input.ownerUserId) {
    await upsertMembership({ organizationId: business.id, userId: input.ownerUserId, role: "org_owner", canViewMedical: true, invitedBy: input.actorUserId });
  }
  await logAudit({ actorUserId: input.actorUserId, organizationId: business.id, action: "business.created", targetTable: "organizations", targetId: business.id, after: { name: business.name, slug, section: input.section, created_by_admin: input.createdByAdmin ?? false } });
  return business;
}

export type BusinessDetailsPatch = Partial<{
  name: string;
  subcategory: string | null;
  island: string | null;
  area: string | null;
  oneLiner: string | null;
  description: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  publicEmail: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
  brandColor: string | null;
  ownerName: string | null;
  ownerBio: string | null;
}>;

const COLUMN_FOR: Record<keyof BusinessDetailsPatch, string> = {
  name: "name",
  subcategory: "subcategory",
  island: "island",
  area: "area",
  oneLiner: "one_liner",
  description: "description",
  phoneE164: "phone_e164",
  whatsappE164: "whatsapp_e164",
  publicEmail: "public_email",
  websiteUrl: "website_url",
  instagramHandle: "instagram_handle",
  brandColor: "brand_color",
  ownerName: "owner_name",
  ownerBio: "owner_bio",
};

// Back to the review queue, only from approved or live. The condition is
// in the write itself, so a page suspended a moment ago stays suspended.
async function backToReview(id: number): Promise<Business | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["approved", "live"])
    .select(BUSINESS_COLUMNS)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not send the change for review");
  return data ? toBusiness(data) : null;
}

// Name and category changes on an approved/live listing go back to review
// (the listing itself stays as it is -- edits publish immediately); the
// rest just saves.
export async function updateBusinessDetails(id: number, patch: BusinessDetailsPatch, actorUserId: string): Promise<Business> {
  const current = await getBusiness(id);
  if (!current) throw new Error("NOT_FOUND");
  const row: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const key of Object.keys(patch) as (keyof BusinessDetailsPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if ((current as unknown as Record<string, unknown>)[key] === value) continue;
    row[COLUMN_FOR[key]] = value;
    changed.push(key);
  }
  if (!changed.length) return current;
  const reviewed = changed.includes("name") || changed.includes("subcategory");
  // A page PortPass has hidden keeps its name and category until it is
  // back: otherwise the change would go live, unreviewed, on unsuspend.
  if (reviewed && current.status === "suspended") throw new Error("SUSPENDED");
  const reReview = reviewed && (current.status === "approved" || current.status === "live");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organizations").update(row).eq("id", id).select(BUSINESS_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save business details");
  const queued = reReview ? await backToReview(id) : null;
  await logAudit({ actorUserId, organizationId: id, action: reReview ? "business.updated.re_review" : "business.updated", targetTable: "organizations", targetId: id, after: { changed } });
  bumpListings();
  return queued ?? toBusiness(data!);
}

// ---- images ---------------------------------------------------------------

export type BusinessImage = { id: number; url: string; alt: string | null; sortOrder: number; consentConfirmed: boolean };
export const MAX_PHOTOS = 8;

function toBusinessImage(row: Record<string, unknown>): BusinessImage {
  return { id: Number(row.id), url: row.url as string, alt: (row.alt as string | null) ?? null, sortOrder: Number(row.sort_order ?? 0), consentConfirmed: Boolean(row.consent_confirmed) };
}

export async function listBusinessImages(id: number): Promise<BusinessImage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organization_images").select("id,url,alt,sort_order,consent_confirmed").eq("organization_id", id).order("sort_order", { ascending: true }).order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load photos");
  return (data ?? []).map(toBusinessImage);
}

// Confirming consent is a statement that the signed forms exist for every
// child in the photo, so it's audit-logged with who said so and when.
export async function setImageConsent(id: number, imageId: number, confirmed: boolean, actorUserId: string): Promise<BusinessImage[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organization_images").update({ consent_confirmed: confirmed }).eq("organization_id", id).eq("id", imageId).select("url").maybeSingle();
  throwIfSupabaseError(error, "Could not update photo consent");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId, organizationId: id, action: confirmed ? "image.consent_confirmed" : "image.consent_withdrawn", targetTable: "organization_images", targetId: imageId, after: { url: data.url } });
  bumpListings();
  return listBusinessImages(id);
}

export async function addBusinessImage(id: number, url: string, alt: string | null): Promise<BusinessImage> {
  const supabase = getSupabaseAdmin();
  const existing = await listBusinessImages(id);
  if (existing.length >= MAX_PHOTOS) throw new Error("TOO_MANY_PHOTOS");
  const { data, error } = await supabase
    .from("organization_images")
    .insert({ organization_id: id, url, alt, sort_order: existing.length })
    .select("id,url,alt,sort_order,consent_confirmed")
    .single();
  throwIfSupabaseError(error, "Could not save photo");
  const business = await getBusiness(id);
  if (business && !business.heroImageUrl) {
    await supabase.from("organizations").update({ hero_image_url: url }).eq("id", id);
  }
  bumpListings();
  return toBusinessImage(data!);
}

export async function removeBusinessImage(id: number, imageId: number): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organization_images").delete().eq("organization_id", id).eq("id", imageId).select("url").maybeSingle();
  throwIfSupabaseError(error, "Could not remove photo");
  const url = (data?.url as string | undefined) ?? null;
  if (url) {
    const business = await getBusiness(id);
    if (business?.heroImageUrl === url) {
      const remaining = await listBusinessImages(id);
      await supabase.from("organizations").update({ hero_image_url: remaining[0]?.url ?? null }).eq("id", id);
    }
  }
  bumpListings();
  return url;
}

export async function setBusinessLogo(id: number, url: string | null): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organizations").update({ logo_url: url }).eq("id", id);
  throwIfSupabaseError(error, "Could not save logo");
  bumpListings();
}

export async function setBusinessHero(id: number, url: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organizations").update({ hero_image_url: url }).eq("id", id);
  throwIfSupabaseError(error, "Could not set the main photo");
  bumpListings();
}

// ---- offerings -------------------------------------------------------------

export type BusinessOffering = {
  id: number;
  type: "program" | "event" | "venue" | "service";
  slug: string;
  name: string;
  summary: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  scheduleText: string | null;
  capacity: number | null;
  isPublished: boolean;
  sortOrder: number;
};

const OFFERING_COLUMNS = "id,type,slug,name,summary,price_cents,price_unit,schedule_text,capacity,is_published,sort_order";

function toOffering(row: Record<string, unknown>): BusinessOffering {
  return {
    id: Number(row.id),
    type: row.type as BusinessOffering["type"],
    slug: row.slug as string,
    name: row.name as string,
    summary: (row.summary as string | null) ?? null,
    priceCents: row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents),
    priceUnit: (row.price_unit as string | null) ?? null,
    scheduleText: (row.schedule_text as string | null) ?? null,
    capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    isPublished: Boolean(row.is_published),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function listBusinessOfferings(id: number): Promise<BusinessOffering[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("offerings").select(OFFERING_COLUMNS).eq("organization_id", id).order("sort_order", { ascending: true }).order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load offerings");
  return (data ?? []).map(toOffering);
}

export type OfferingInput = {
  name: string;
  summary: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  scheduleText: string | null;
  capacity: number | null;
  type: BusinessOffering["type"];
};

// No price, no publish: an offering without a price is saved as a draft
// whatever the caller asked for. Publishing an approved business's first
// priced offering also takes the business live -- that's the moment it
// has something to book.
export async function upsertBusinessOffering(id: number, offeringId: number | null, input: OfferingInput, actorUserId: string): Promise<BusinessOffering> {
  const supabase = getSupabaseAdmin();
  const priced = input.priceCents !== null && input.priceCents >= 0;
  const record: Record<string, unknown> = {
    organization_id: id,
    type: input.type,
    name: input.name.trim(),
    summary: input.summary,
    price_cents: priced ? input.priceCents : null,
    price_unit: priced ? input.priceUnit : null,
    schedule_text: input.scheduleText,
    capacity: input.capacity,
    is_published: priced,
  };
  let result;
  if (offeringId === null) {
    const existing = await listBusinessOfferings(id);
    const base = slugify(input.name) === "program" ? "offering" : slugify(input.name);
    let slug = base;
    let n = 2;
    while (existing.some((o) => o.slug === slug)) slug = `${base}-${n++}`;
    record.slug = slug;
    record.sort_order = existing.length;
    result = await supabase.from("offerings").insert(record).select(OFFERING_COLUMNS).single();
  } else {
    result = await supabase.from("offerings").update(record).eq("id", offeringId).eq("organization_id", id).select(OFFERING_COLUMNS).single();
  }
  throwIfSupabaseError(result.error, "Could not save offering");
  const offering = toOffering(result.data!);
  await logAudit({ actorUserId, organizationId: id, action: offeringId === null ? "offering.created" : "offering.updated", targetTable: "offerings", targetId: offering.id, after: { name: offering.name, price_cents: offering.priceCents, is_published: offering.isPublished } });

  if (priced) {
    const business = await getBusiness(id);
    if (business && business.status === "approved" && !business.isPublished) {
      // Only from "approved": a page suspended a moment ago stays hidden.
      const { data: live, error } = await supabase.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", id).eq("status", "approved").select("id").maybeSingle();
      if (!error && live) await logAudit({ actorUserId, organizationId: id, action: "business.went_live", targetTable: "organizations", targetId: id });
    }
  }
  bumpListings();
  return offering;
}

export async function removeBusinessOffering(id: number, offeringId: number, actorUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("offerings").delete().eq("organization_id", id).eq("id", offeringId);
  throwIfSupabaseError(error, "Could not remove offering");
  bumpListings();
  await logAudit({ actorUserId, organizationId: id, action: "offering.deleted", targetTable: "offerings", targetId: offeringId });
}

// ---- payment methods -------------------------------------------------------

export const PAYMENT_METHODS = ["cash", "bank_transfer"] as const;

export async function updatePaymentMethods(
  id: number,
  actorUserId: string,
  input: { paymentMethods: string[]; bankTransferDetails: BankTransferDetails | null },
): Promise<{ business: Business; bankDetailsChanged: boolean }> {
  const current = await getBusiness(id);
  if (!current) throw new Error("NOT_FOUND");
  const methods = input.paymentMethods.filter((m): m is (typeof PAYMENT_METHODS)[number] => (PAYMENT_METHODS as readonly string[]).includes(m));
  const bank = methods.includes("bank_transfer") ? input.bankTransferDetails : null;
  const bankDetailsChanged = JSON.stringify(current.bankTransferDetails) !== JSON.stringify(bank);
  const row: Record<string, unknown> = { payment_methods: methods, bank_transfer_details: bank };
  // Bank details can't change while PortPass has the page hidden (see
  // updateBusinessDetails).
  if (bankDetailsChanged && current.status === "suspended") throw new Error("SUSPENDED");
  const reReview = bankDetailsChanged && (current.status === "approved" || current.status === "live");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organizations").update(row).eq("id", id).select(BUSINESS_COLUMNS).single();
  throwIfSupabaseError(error, "Could not save payment methods");
  const queued = reReview ? await backToReview(id) : null;
  await logAudit({
    actorUserId,
    organizationId: id,
    action: bankDetailsChanged ? "organization.bank_details.updated" : "organization.payment_methods.updated",
    targetTable: "organizations",
    targetId: id,
    before: { payment_methods: current.paymentMethods, bank_transfer_details: current.bankTransferDetails },
    after: { payment_methods: methods, bank_transfer_details: bank },
  });
  return { business: queued ?? toBusiness(data!), bankDetailsChanged };
}

export async function listOwnerEmails(id: number): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organization_members").select("user_id").eq("organization_id", id).eq("role", "org_owner");
  throwIfSupabaseError(error, "Could not load owners");
  const emails: string[] = [];
  for (const row of data ?? []) {
    const { data: user } = await supabase.auth.admin.getUserById(row.user_id as string);
    if (user?.user?.email) emails.push(user.user.email);
  }
  return emails;
}

// ---- invites ---------------------------------------------------------------

export type BusinessInvite = { id: number; email: string; role: OrgRole; canViewMedical: boolean; acceptedAt: string | null; expiresAt: string; createdAt: string };

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvite(id: number, input: { email: string; role: OrgRole; canViewMedical: boolean; invitedBy: string }): Promise<{ invite: BusinessInvite; token: string }> {
  const supabase = getSupabaseAdmin();
  const token = randomBytes(24).toString("hex");
  const { data, error } = await supabase
    .from("organization_invites")
    .insert({
      organization_id: id,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      can_view_medical: input.role === "org_staff" ? input.canViewMedical : false,
      token_hash: hashInviteToken(token),
      expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
      invited_by: input.invitedBy,
    })
    .select("id,email,role,can_view_medical,accepted_at,expires_at,created_at")
    .single();
  throwIfSupabaseError(error, "Could not create invite");
  await logAudit({ actorUserId: input.invitedBy, organizationId: id, action: "invite.created", targetTable: "organization_invites", targetId: Number(data!.id), after: { email: input.email.trim().toLowerCase(), role: input.role, can_view_medical: input.canViewMedical } });
  return { invite: toInvite(data!), token };
}

function toInvite(row: Record<string, unknown>): BusinessInvite {
  return {
    id: Number(row.id),
    email: row.email as string,
    role: row.role as OrgRole,
    canViewMedical: Boolean(row.can_view_medical),
    acceptedAt: (row.accepted_at as string | null) ?? null,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
  };
}

export async function listInvites(id: number): Promise<BusinessInvite[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organization_invites").select("id,email,role,can_view_medical,accepted_at,expires_at,created_at").eq("organization_id", id).order("id", { ascending: false });
  throwIfSupabaseError(error, "Could not load invites");
  return (data ?? []).map(toInvite);
}

export async function revokeInvite(id: number, inviteId: number, actorUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organization_invites").delete().eq("organization_id", id).eq("id", inviteId).is("accepted_at", null);
  throwIfSupabaseError(error, "Could not revoke invite");
  await logAudit({ actorUserId, organizationId: id, action: "invite.revoked", targetTable: "organization_invites", targetId: inviteId });
}

export type TeamMember = { userId: string; role: OrgRole; canViewMedical: boolean; fullName: string; createdAt: string };

export async function listTeam(id: number): Promise<TeamMember[]> {
  const supabase = getSupabaseAdmin();
  // organization_members and profiles both hang off auth.users with no FK
  // between them, so PostgREST can't embed one in the other: two reads.
  const { data, error } = await supabase.from("organization_members").select("user_id,role,can_view_medical,created_at").eq("organization_id", id).order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load team");
  const members = data ?? [];
  const names = new Map<string, string>();
  if (members.length) {
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("user_id,full_name").in("user_id", members.map((m) => m.user_id as string));
    throwIfSupabaseError(profileError, "Could not load team profiles");
    for (const p of profiles ?? []) names.set(p.user_id as string, p.full_name as string);
  }
  return members.map((row) => ({
    userId: row.user_id as string,
    role: row.role as OrgRole,
    canViewMedical: Boolean(row.can_view_medical),
    fullName: names.get(row.user_id as string) ?? "Member",
    createdAt: row.created_at as string,
  }));
}

// ---- submit ----------------------------------------------------------------

export function submissionProblems(business: Business, offerings: BusinessOffering[]): string[] {
  const problems: string[] = [];
  if (!business.name.trim()) problems.push("Give the business a name.");
  if (!business.primaryCategory) problems.push("Choose a section.");
  if (!business.oneLiner) problems.push("Add the one-line description.");
  if (!business.whatsappE164 && !business.phoneE164) problems.push("Add a phone or WhatsApp number.");
  if (!business.paymentMethods.length) problems.push("Choose at least one way customers can pay.");
  if (business.paymentMethods.includes("bank_transfer") && !business.bankTransferDetails?.accountNumber) problems.push("Add your bank transfer details.");
  if (!offerings.length) problems.push("Add at least one offering (it can be a draft without a price for now).");
  return problems;
}

export async function submitBusiness(id: number, actorUserId: string): Promise<Business> {
  const business = await getBusiness(id);
  if (!business) throw new Error("NOT_FOUND");
  // Only a draft is submitted. A page that is under review, live, or
  // hidden by PortPass can't be put back in the queue from here: without
  // this, the owner of a suspended page could quietly un-suspend it.
  if (business.status !== "draft") throw new Error("NOT_DRAFT");
  const problems = submissionProblems(business, await listBusinessOfferings(id));
  if (problems.length) {
    const error = new Error("INCOMPLETE") as Error & { problems: string[] };
    error.problems = problems;
    throw error;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .update({ status: "submitted", submitted_at: new Date().toISOString(), review_note: null })
    .eq("id", id)
    .eq("status", "draft")
    .select(BUSINESS_COLUMNS)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not submit business");
  if (!data) throw new Error("NOT_DRAFT");
  await logAudit({ actorUserId, organizationId: id, action: "business.submitted", targetTable: "organizations", targetId: id });
  bumpListings();
  return toBusiness(data);
}

// ---- categories -----------------------------------------------------------
// The primary category (subcategory when set, else the section) is mirrored
// into organization_categories by a database trigger. Extra categories --
// a photographer under Weddings → Photo & Video *and* Services → Photo &
// Video (round 5, §1) -- are set here: one listing in several places, never
// a second row. Section pages, counts and the sitemap all read that table.

export async function listBusinessCategorySlugs(id: number): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organization_categories").select("category_id").eq("organization_id", id);
  throwIfSupabaseError(error, "Could not load business categories");
  const categories = await listCategories();
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));
  return (data ?? [])
    .map((row) => slugById.get(Number(row.category_id)))
    .filter((slug): slug is string => Boolean(slug))
    .sort();
}

// Replaces the business's extra categories with `slugs` (the primary is
// always kept). Throws UNKNOWN_CATEGORY:<slug> for a slug that isn't in the
// categories table.
export async function setBusinessExtraCategories(id: number, slugs: string[], actorUserId: string | null): Promise<string[]> {
  const business = await getBusiness(id);
  if (!business) throw new Error("NOT_FOUND");
  const categories = await listCategories();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const wanted = new Set<number>();
  const primarySlug = business.subcategory ?? business.primaryCategory;
  const primary = primarySlug ? bySlug.get(primarySlug) : undefined;
  if (primary) wanted.add(primary.id);
  for (const slug of slugs) {
    const category = bySlug.get(slug);
    if (!category) throw new Error(`UNKNOWN_CATEGORY:${slug}`);
    wanted.add(category.id);
  }

  const supabase = getSupabaseAdmin();
  const { data: currentRows, error } = await supabase.from("organization_categories").select("category_id").eq("organization_id", id);
  throwIfSupabaseError(error, "Could not load business categories");
  const current = new Set((currentRows ?? []).map((row) => Number(row.category_id)));
  const toRemove = Array.from(current).filter((categoryId) => !wanted.has(categoryId));
  const toAdd = Array.from(wanted).filter((categoryId) => !current.has(categoryId));
  if (toRemove.length) {
    const { error: removeError } = await supabase.from("organization_categories").delete().eq("organization_id", id).in("category_id", toRemove);
    throwIfSupabaseError(removeError, "Could not update business categories");
  }
  if (toAdd.length) {
    const { error: addError } = await supabase.from("organization_categories").insert(toAdd.map((categoryId) => ({ organization_id: id, category_id: categoryId })));
    throwIfSupabaseError(addError, "Could not update business categories");
  }
  const result = await listBusinessCategorySlugs(id);
  if (toRemove.length || toAdd.length) {
    await logAudit({ actorUserId, organizationId: id, action: "business.categories.updated", targetTable: "organization_categories", targetId: id, after: { categories: result } });
  }
  bumpListings();
  return result;
}
