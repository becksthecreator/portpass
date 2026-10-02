import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type PlatformRole = "platform_owner" | "platform_admin";
export type OrgRole = "org_owner" | "org_admin" | "org_staff" | "org_viewer";
export const ORG_ROLES: OrgRole[] = ["org_viewer", "org_staff", "org_admin", "org_owner"];

export type Profile = {
  userId: string;
  fullName: string;
  phoneE164: string | null;
  platformRole: PlatformRole | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type Membership = {
  id: number;
  organizationId: number;
  organizationSlug: string | null;
  organizationName: string;
  organizationStatus: string;
  role: OrgRole;
  canViewMedical: boolean;
};

export type OrganizationSummary = { id: number; slug: string | null; name: string; status: string };

function toProfile(row: Record<string, unknown>): Profile {
  return {
    userId: row.user_id as string,
    fullName: row.full_name as string,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    platformRole: (row.platform_role as PlatformRole | null) ?? null,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,full_name,phone_e164,platform_role,last_seen_at,created_at")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load profile");
  return data ? toProfile(data) : null;
}

// `nameFromEmail`: the name was made from the email address because none
// was typed (shown to businesses as "Member", brief 10). Left as it is
// when not given.
export async function upsertProfile(input: { userId: string; fullName: string; phoneE164?: string | null; platformRole?: PlatformRole | null; nameFromEmail?: boolean }): Promise<Profile> {
  const supabase = getSupabaseAdmin();
  const record: Record<string, unknown> = { user_id: input.userId, full_name: input.fullName, last_seen_at: new Date().toISOString() };
  if (input.nameFromEmail !== undefined) record.name_from_email = input.nameFromEmail;
  if (input.phoneE164 !== undefined) record.phone_e164 = input.phoneE164;
  if (input.platformRole !== undefined) record.platform_role = input.platformRole;
  const { data, error } = await supabase
    .from("profiles")
    .upsert(record, { onConflict: "user_id" })
    .select("user_id,full_name,phone_e164,platform_role,last_seen_at,created_at")
    .single();
  throwIfSupabaseError(error, "Could not save profile");
  if (!data) throw new Error("Could not save profile");
  return toProfile(data);
}

// Which Terms and Privacy Policy versions were in force when the account
// was created (the sign-up screen says continuing means agreeing to them).
// Written once; later versions are not silently recorded as accepted.
export async function recordLegalAcceptance(userId: string, versions: { terms: number; privacy: number }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ terms_version: versions.terms, privacy_version: versions.privacy, legal_accepted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("legal_accepted_at", null);
  throwIfSupabaseError(error, "Could not record the accepted terms");
}

export async function touchLastSeen(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("user_id", userId);
  throwIfSupabaseError(error, "Could not update last seen");
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id,organization_id,role,can_view_medical,organizations(slug,name,status)")
    .eq("user_id", userId)
    .order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load memberships");
  return (data ?? []).map((row) => {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { slug: string | null; name: string; status: string } | null;
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      organizationSlug: org?.slug ?? null,
      organizationName: org?.name ?? "",
      organizationStatus: org?.status ?? "draft",
      role: row.role as OrgRole,
      canViewMedical: Boolean(row.can_view_medical),
    };
  });
}

export async function upsertMembership(input: { organizationId: number; userId: string; role: OrgRole; canViewMedical: boolean; invitedBy?: string | null }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organization_members").upsert(
    {
      organization_id: input.organizationId,
      user_id: input.userId,
      role: input.role,
      can_view_medical: input.canViewMedical,
      invited_by: input.invitedBy ?? null,
    },
    { onConflict: "organization_id,user_id" },
  );
  throwIfSupabaseError(error, "Could not save membership");
}

export function canViewMedical(membership: { role: OrgRole; canViewMedical: boolean }): boolean {
  return membership.role === "org_owner" || membership.role === "org_admin" || (membership.role === "org_staff" && membership.canViewMedical);
}

// Lighter than db/organizations.ts's getOrganizationBySlug, which also
// runs the Futprep pilot seeding on every read.
export async function getOrganizationSummary(ref: number | { slug: string }): Promise<OrganizationSummary | null> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("organizations").select("id,slug,name,status");
  query = typeof ref === "number" ? query.eq("id", ref) : query.eq("slug", ref.slug);
  const { data, error } = await query.maybeSingle();
  throwIfSupabaseError(error, "Could not load organization");
  return data ? { id: Number(data.id), slug: (data.slug as string | null) ?? null, name: data.name as string, status: data.status as string } : null;
}

export type PendingInvite = { id: number; organizationId: number; role: OrgRole; canViewMedical: boolean; invitedBy: string | null };

export async function listPendingInvitesForEmail(email: string): Promise<PendingInvite[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organization_invites")
    .select("id,organization_id,role,can_view_medical,invited_by")
    .eq("email", email.trim())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());
  throwIfSupabaseError(error, "Could not load invites");
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    role: row.role as OrgRole,
    canViewMedical: Boolean(row.can_view_medical),
    invitedBy: (row.invited_by as string | null) ?? null,
  }));
}

export async function markInviteAccepted(inviteId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organization_invites").update({ accepted_at: new Date().toISOString() }).eq("id", inviteId).is("accepted_at", null);
  throwIfSupabaseError(error, "Could not mark invite accepted");
}

export async function markOrganizationClaimed(organizationId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organizations").update({ claimed_at: new Date().toISOString() }).eq("id", organizationId).is("claimed_at", null);
  throwIfSupabaseError(error, "Could not mark organization claimed");
}

export type Person = { id: number; authUserId: string | null; name: string; email: string | null; phoneE164: string | null };

function toPerson(row: Record<string, unknown>): Person {
  return {
    id: Number(row.id),
    authUserId: (row.auth_user_id as string | null) ?? null,
    name: row.name as string,
    email: (row.email as string | null) ?? null,
    phoneE164: (row.phone_e164 as string | null) ?? null,
  };
}

export async function findPersonByEmail(email: string): Promise<Person | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("people").select("id,auth_user_id,name,email,phone_e164").eq("email", email.trim()).maybeSingle();
  throwIfSupabaseError(error, "Could not look up person");
  return data ? toPerson(data) : null;
}

export async function findPersonByUser(userId: string): Promise<Person | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("people").select("id,auth_user_id,name,email,phone_e164").eq("auth_user_id", userId).maybeSingle();
  throwIfSupabaseError(error, "Could not look up person");
  return data ? toPerson(data) : null;
}

// Sets auth_user_id on the existing row -- never a second person for the
// same verified email (the brief's rule for linking earlier bookings).
export async function linkPersonToUser(personId: number, userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("people").update({ auth_user_id: userId }).eq("id", personId).is("auth_user_id", null);
  throwIfSupabaseError(error, "Could not link person to account");
}

// Guest first, account after (speed & sign-in brief, 29 Sept, 2.1): a
// registration made as a guest carries the parent's email; once that
// email owns an account, the rows are attached to the person so "your
// registrations" can find them. Only rows with no parent yet, by exact
// (lower-cased) email. Returns how many were linked.
export async function linkRegistrationsToPerson(personId: number, email: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("registrations")
    .update({ parent_person_id: personId })
    .is("parent_person_id", null)
    .eq("parent_email", email.trim().toLowerCase())
    .select("id");
  throwIfSupabaseError(error, "Could not link registrations to account");
  return (data ?? []).length;
}

export async function createPerson(input: { name: string; email: string | null; phoneE164: string | null; authUserId?: string | null }): Promise<Person> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("people")
    .insert({ name: input.name, email: input.email, phone_e164: input.phoneE164, auth_user_id: input.authUserId ?? null })
    .select("id,auth_user_id,name,email,phone_e164")
    .single();
  throwIfSupabaseError(error, "Could not create person");
  if (!data) throw new Error("Could not create person");
  return toPerson(data);
}
