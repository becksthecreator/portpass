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

export async function upsertProfile(input: { userId: string; fullName: string; phoneE164?: string | null; platformRole?: PlatformRole | null }): Promise<Profile> {
  const supabase = getSupabaseAdmin();
  const record: Record<string, unknown> = { user_id: input.userId, full_name: input.fullName, last_seen_at: new Date().toISOString() };
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

export function canViewMedical(membership: { role: OrgRole; canViewMedical: boolean }): boolean {
  return membership.role === "org_owner" || membership.role === "org_admin" || (membership.role === "org_staff" && membership.canViewMedical);
}

export type Person = { id: number; authUserId: string | null; name: string; email: string | null; phoneE164: string | null };

export async function findPersonByEmail(email: string): Promise<Person | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("people")
    .select("id,auth_user_id,name,email,phone_e164")
    .eq("email", email.trim())
    .maybeSingle();
  throwIfSupabaseError(error, "Could not look up person");
  return data
    ? { id: Number(data.id), authUserId: (data.auth_user_id as string | null) ?? null, name: data.name as string, email: (data.email as string | null) ?? null, phoneE164: (data.phone_e164 as string | null) ?? null }
    : null;
}

// Sets auth_user_id on the existing row -- never a second person for the
// same verified email (the brief's rule for linking earlier bookings).
export async function linkPersonToUser(personId: number, userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("people").update({ auth_user_id: userId }).eq("id", personId).is("auth_user_id", null);
  throwIfSupabaseError(error, "Could not link person to account");
}
