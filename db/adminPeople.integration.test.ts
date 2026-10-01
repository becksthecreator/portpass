import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertMembership } from "./accounts";
import { forceSignOut, listAdminPeople, listOpenInvites, listStaffPinStatus, removeMember, renewInvite, setMemberRole } from "./adminPeople";
import { createDraftBusiness, createInvite } from "./business";

// Admin -> People & access (brief 08, 1.5) against CI's local Supabase
// stack: change a role, remove access, never leave a business without an
// owner, sign someone out everywhere, and renew an invitation. Every
// person and business is "TEST — delete" and removed afterwards.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let founder = "";
let owner = "";
let helper = "";
let orgId = 0;

async function user(label: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email: `test-delete-${label}-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  await admin.from("profiles").upsert({ user_id: created.data.user.id, full_name: `TEST delete ${label} ${TAG}` });
  return created.data.user.id;
}

const roleOf = async (userId: string) => (await admin.from("organization_members").select("role,can_view_medical").eq("organization_id", orgId).eq("user_id", userId).maybeSingle()).data;
const actions = async () => ((await admin.from("audit_log").select("action").eq("organization_id", orgId)).data ?? []).map((row) => row.action as string);

beforeAll(async () => {
  founder = await user("founder");
  owner = await user("owner");
  helper = await user("helper");
  const business = await createDraftBusiness({ name: `TEST delete ${TAG} People`, section: "entertainment", subcategory: null, ownerUserId: owner, actorUserId: founder });
  orgId = business.id;
  await upsertMembership({ organizationId: orgId, userId: helper, role: "org_staff", canViewMedical: true, invitedBy: owner });
});

afterAll(async () => {
  if (orgId) {
    await admin.from("audit_log").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const id of [founder, owner, helper]) {
    if (!id) continue;
    await admin.from("audit_log").delete().eq("actor_user_id", id);
    await admin.from("audit_log").delete().eq("target_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe("roles and access", () => {
  it("lists the person with their business and role", async () => {
    const people = await listAdminPeople();
    const person = people.find((p) => p.userId === helper);
    expect(person?.memberships).toEqual([expect.objectContaining({ organizationId: orgId, role: "org_staff" })]);
  });

  it("changes a role, and a viewer never keeps access to medical details", async () => {
    await setMemberRole(orgId, helper, "org_admin", founder);
    expect(await roleOf(helper)).toEqual({ role: "org_admin", can_view_medical: true });
    await setMemberRole(orgId, helper, "org_viewer", founder);
    expect(await roleOf(helper)).toEqual({ role: "org_viewer", can_view_medical: false });
    // Back up to staff: the flag is not widened from here.
    await setMemberRole(orgId, helper, "org_staff", founder);
    expect(await roleOf(helper)).toEqual({ role: "org_staff", can_view_medical: false });
    expect(await actions()).toContain("member.role_changed");
    await expect(setMemberRole(orgId, founder, "org_staff", founder)).rejects.toThrow("NOT_FOUND");
  });

  it("never leaves a business without an owner", async () => {
    await expect(setMemberRole(orgId, owner, "org_admin", founder)).rejects.toThrow("LAST_OWNER");
    await expect(removeMember(orgId, owner, founder)).rejects.toThrow("LAST_OWNER");
    expect((await roleOf(owner))?.role).toBe("org_owner");
    // With a second owner, the first can step down.
    await setMemberRole(orgId, helper, "org_owner", founder);
    await setMemberRole(orgId, owner, "org_admin", founder);
    expect((await roleOf(owner))?.role).toBe("org_admin");
  });

  it("removes a person's access to the business", async () => {
    await removeMember(orgId, owner, founder);
    expect(await roleOf(owner)).toBeNull();
    expect(await actions()).toContain("member.removed");
    await expect(removeMember(orgId, owner, founder)).rejects.toThrow("NOT_FOUND");
  });
});

describe("force sign-out", () => {
  it("ends every session the person has, and says how many", async () => {
    // A real session: a one-time code for the test user, exchanged for one.
    const email = `test-delete-helper-${TAG}@test.portpass.local`;
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).toBeNull();
    const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await browser.auth.verifyOtp({ email, token: link.data.properties!.email_otp, type: "email" });
    expect(signedIn.error).toBeNull();
    const token = signedIn.data.session!.access_token;
    expect((await admin.auth.getUser(token)).data.user?.id).toBe(helper);

    expect(await forceSignOut(helper, founder)).toBeGreaterThanOrEqual(1);
    // The token no longer opens anything: the session behind it is gone.
    const after = await admin.auth.getUser(token);
    expect(after.data.user).toBeNull();
    expect(await forceSignOut(helper, founder)).toBe(0);
  });
});

describe("invitations and staff PINs", () => {
  it("lists an open invitation and renews it for another 14 days", async () => {
    const { invite } = await createInvite(orgId, { email: `test-delete-invited-${TAG}@test.portpass.local`, role: "org_staff", canViewMedical: false, invitedBy: founder });
    await admin.from("organization_invites").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", invite.id);
    expect((await listOpenInvites()).find((i) => i.id === invite.id)).toMatchObject({ organizationId: orgId, email: `test-delete-invited-${TAG}@test.portpass.local`, role: "org_staff" });

    const renewed = await renewInvite(invite.id, founder);
    expect(renewed).not.toBeNull();
    expect(new Date(renewed!.expiresAt).getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 3600_000);
    expect(await actions()).toContain("invite.resent");

    // An accepted invitation is not renewed.
    await admin.from("organization_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    expect(await renewInvite(invite.id, founder)).toBeNull();
  });

  it("shows whether each staff PIN was changed, and never the PIN", async () => {
    const pins = await listStaffPinStatus();
    for (const pin of pins) expect(Object.keys(pin).sort()).toEqual(["active", "name", "organizationName", "pinChanged", "role"]);
    expect(JSON.stringify(pins)).not.toMatch(/pin_hash|account_key/);
  });
});
