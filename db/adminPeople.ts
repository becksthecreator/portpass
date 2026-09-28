import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import type { OrgRole, PlatformRole } from "./accounts";

// Every account as the Control Center lists it (28 Sept brief, 1.5): who
// they are, when they were last seen, and what they belong to. Emails
// come from Supabase Auth (service role); nothing medical is anywhere
// near this shape.
export type AdminPerson = {
  userId: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  platformRole: PlatformRole | null;
  lastSeenAt: string | null;
  createdAt: string;
  memberships: { organizationId: number; organizationName: string; organizationSlug: string | null; role: OrgRole }[];
};

export async function listAdminPeople(): Promise<AdminPerson[]> {
  const supabase = getSupabaseAdmin();
  const [{ data: profiles, error: profilesError }, { data: members, error: membersError }, users] = await Promise.all([
    supabase.from("profiles").select("user_id,full_name,phone_e164,platform_role,last_seen_at,created_at").order("created_at", { ascending: false }),
    supabase.from("organization_members").select("user_id,organization_id,role,organizations(name,slug)"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  throwIfSupabaseError(profilesError, "Could not load profiles");
  throwIfSupabaseError(membersError, "Could not load memberships");
  if (users.error) throw new Error(`Could not list users: ${users.error.message}`);

  const emailByUser = new Map(users.data.users.map((u) => [u.id, u.email ?? null]));
  const membershipsByUser = new Map<string, AdminPerson["memberships"]>();
  for (const row of members ?? []) {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null } | null;
    const list = membershipsByUser.get(row.user_id as string) ?? [];
    list.push({ organizationId: Number(row.organization_id), organizationName: org?.name ?? "", organizationSlug: org?.slug ?? null, role: row.role as OrgRole });
    membershipsByUser.set(row.user_id as string, list);
  }
  return (profiles ?? []).map((p) => ({
    userId: p.user_id as string,
    fullName: p.full_name as string,
    email: emailByUser.get(p.user_id as string) ?? null,
    phoneE164: (p.phone_e164 as string | null) ?? null,
    platformRole: (p.platform_role as PlatformRole | null) ?? null,
    lastSeenAt: (p.last_seen_at as string | null) ?? null,
    createdAt: p.created_at as string,
    memberships: membershipsByUser.get(p.user_id as string) ?? [],
  }));
}
