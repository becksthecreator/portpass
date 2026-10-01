import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { canViewMedical, ORG_ROLES, upsertMembership, type OrgRole, type PlatformRole } from "./accounts";

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

// ---- Access controls (brief 08, 1.5) -------------------------------------------
// Each is audit-logged with the founder who did it. A business is never
// left without an owner: the last owner can't be demoted or removed here.

async function ownersOf(organizationId: number): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin().from("organization_members").select("user_id").eq("organization_id", organizationId).eq("role", "org_owner");
  throwIfSupabaseError(error, "Could not load owners");
  return (data ?? []).map((row) => row.user_id as string);
}

async function membership(organizationId: number, userId: string): Promise<{ role: OrgRole; canViewMedical: boolean } | null> {
  const { data, error } = await getSupabaseAdmin().from("organization_members").select("role,can_view_medical").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the membership");
  return data ? { role: data.role as OrgRole, canViewMedical: Boolean(data.can_view_medical) } : null;
}

export async function setMemberRole(organizationId: number, userId: string, role: OrgRole, actorUserId: string): Promise<void> {
  if (!ORG_ROLES.includes(role)) throw new Error("INVALID_ROLE");
  const current = await membership(organizationId, userId);
  if (!current) throw new Error("NOT_FOUND");
  if (current.role === role) return;
  if (current.role === "org_owner") {
    const owners = await ownersOf(organizationId);
    if (owners.length <= 1) throw new Error("LAST_OWNER");
  }
  // The staff flag for children's medical details is never switched on
  // from here: a viewer loses it, everyone else keeps what they had. An
  // owner or admin can always see those details, whatever the flag says,
  // so the log records what the person can see before and after.
  const flag = role === "org_viewer" ? false : current.canViewMedical;
  // The role read above is in the write: a change made a moment ago by
  // someone else is not overwritten or logged with a stale "before".
  const { data, error } = await getSupabaseAdmin().from("organization_members").update({ role, can_view_medical: flag }).eq("organization_id", organizationId).eq("user_id", userId).eq("role", current.role).select("user_id");
  throwIfSupabaseError(error, "Could not change the role");
  if (!data?.length) throw new Error("NOT_FOUND");
  if (current.role === "org_owner" && (await ownersOf(organizationId)).length === 0) {
    // Two founders demoted the last two owners at the same moment: undo this one.
    await getSupabaseAdmin().from("organization_members").update({ role: "org_owner", can_view_medical: current.canViewMedical }).eq("organization_id", organizationId).eq("user_id", userId);
    throw new Error("LAST_OWNER");
  }
  await logAudit({ actorUserId, organizationId, action: "member.role_changed", targetTable: "organization_members", targetId: userId, before: { role: current.role, can_view_medical: canViewMedical(current) }, after: { role, can_view_medical: canViewMedical({ role, canViewMedical: flag }) } });
}

export async function removeMember(organizationId: number, userId: string, actorUserId: string): Promise<void> {
  const current = await membership(organizationId, userId);
  if (!current) throw new Error("NOT_FOUND");
  if (current.role === "org_owner") {
    const owners = await ownersOf(organizationId);
    if (owners.length <= 1) throw new Error("LAST_OWNER");
  }
  const { data, error } = await getSupabaseAdmin().from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", userId).eq("role", current.role).select("user_id");
  throwIfSupabaseError(error, "Could not remove access");
  if (!data?.length) throw new Error("NOT_FOUND");
  if (current.role === "org_owner" && (await ownersOf(organizationId)).length === 0) {
    // Two founders removed the last two owners at the same moment: put this one back.
    await upsertMembership({ organizationId, userId, role: "org_owner", canViewMedical: current.canViewMedical });
    throw new Error("LAST_OWNER");
  }
  await logAudit({ actorUserId, organizationId, action: "member.removed", targetTable: "organization_members", targetId: userId, before: { role: current.role } });
}

// Ends every session the person has. Their next request is refused and
// they sign in again; nothing about their account is changed.
export async function forceSignOut(userId: string, actorUserId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("admin_revoke_sessions", { p_user_id: userId });
  throwIfSupabaseError(error, "Could not sign the person out");
  await logAudit({ actorUserId, action: "user.signed_out", targetTable: "auth.users", targetId: userId, after: { sessions_ended: Number(data) || 0 } });
  return Number(data) || 0;
}

export type AdminInvite = { id: number; organizationId: number; organizationName: string; organizationSlug: string | null; email: string; role: OrgRole; expiresAt: string; createdAt: string };

// Invitations nobody has accepted yet, newest first.
export async function listOpenInvites(): Promise<AdminInvite[]> {
  const { data, error } = await getSupabaseAdmin().from("organization_invites").select("id,organization_id,email,role,expires_at,created_at,organizations(name,slug)").is("accepted_at", null).order("id", { ascending: false }).limit(200);
  throwIfSupabaseError(error, "Could not load invitations");
  return (data ?? []).map((row) => {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string; slug: string | null } | null;
    return { id: Number(row.id), organizationId: Number(row.organization_id), organizationName: org?.name ?? "", organizationSlug: org?.slug ?? null, email: String(row.email), role: row.role as OrgRole, expiresAt: String(row.expires_at), createdAt: String(row.created_at) };
  });
}

// Gives an open invitation another 14 days and returns it, so the route
// can email it again. Signing in with that address accepts it.
export async function renewInvite(inviteId: number, actorUserId: string): Promise<AdminInvite | null> {
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600_000).toISOString();
  const { data, error } = await getSupabaseAdmin().from("organization_invites").update({ expires_at: expiresAt }).eq("id", inviteId).is("accepted_at", null).select("id,organization_id,email,role,expires_at,created_at,organizations(name,slug)").maybeSingle();
  throwIfSupabaseError(error, "Could not renew the invitation");
  if (!data) return null;
  const org = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as { name: string; slug: string | null } | null;
  await logAudit({ actorUserId, organizationId: Number(data.organization_id), action: "invite.resent", targetTable: "organization_invites", targetId: inviteId, after: { email: String(data.email) } });
  return { id: Number(data.id), organizationId: Number(data.organization_id), organizationName: org?.name ?? "", organizationSlug: org?.slug ?? null, email: String(data.email), role: data.role as OrgRole, expiresAt: String(data.expires_at), createdAt: String(data.created_at) };
}

export type StaffPinStatus = { organizationName: string; name: string; role: string; active: boolean; pinChanged: boolean };

// Staff PIN logins per business, until PINs are retired: who has changed
// the PIN an admin set for them. Never the PIN or its hash.
export async function listStaffPinStatus(): Promise<StaffPinStatus[]> {
  const { data, error } = await getSupabaseAdmin().from("staff_members").select("name,role,active,pin_changed_at,account_key,organizations(name)").not("account_key", "is", null).order("organization_id", { ascending: true }).order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load staff logins");
  return (data ?? []).map((row) => {
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { name: string } | null;
    return { organizationName: org?.name ?? "", name: String(row.name), role: String(row.role), active: Boolean(row.active), pinChanged: row.pin_changed_at !== null };
  });
}
