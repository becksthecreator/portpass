import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalSupabase } from "@/lib/localStackOnly.mjs";
import { assignStaffLogin, listStaffAccounts, listStaffWithoutLogin, setStaffCanViewMedical } from "@/app/futprep/staff-auth";
import { listAllCoachProfiles } from "./coaches";
import { futprepOwnerRequest, futprepOwnerStaffState, grantFutprepOwner, markFutprepOwner, revokeFutprepOwnerGrant, setFutprepStaffEmail } from "./futprepOwner";

// Brief 31 (A) against CI's local Supabase stack, with TEST rows in
// organisation 1 (where app/futprep/staff-auth.ts reads Futprep's staff),
// all deleted afterwards: a person already on the team gets a login on
// their own row instead of a second row; an admin's medical view is a
// switch with an audit line; marking the owner from a staff login writes
// no membership, a founder's grant does, and only for someone who has
// signed in, and it is taken back when the mark moves or the login is
// switched off; the Team page's chips are yes/no facts, never a PIN hash.
// It writes into organisation 1 and moves the owner mark there, so it
// refuses any database but a local stack.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${tag}`;
const staffIds: number[] = [];
const names = new Map<number, string>();
let coachId = 0;
let userId = "";
let personId = 0;
const ownerEmail = `test-delete-owner-${tag}@test.portpass.local`;
let founderId = "";

async function staffRow(name: string, role: string, extra: Record<string, unknown> = {}): Promise<number> {
  const { data, error } = await db().from("staff_members").insert({ organization_id: 1, name: `${MARK} ${name}`, role, responsibilities: "", active: true, ...extra }).select("id").single();
  expect(error).toBeNull();
  staffIds.push(Number(data!.id));
  names.set(Number(data!.id), name);
  return Number(data!.id);
}

beforeAll(async () => {
  assertLocalSupabase();
  const { data: org } = await db().from("organizations").select("id").eq("id", 1).single();
  expect(org).not.toBeNull();
});

afterAll(async () => {
  if (coachId) await db().from("coach_profiles").delete().eq("id", coachId);
  if (userId) await db().from("organization_members").delete().eq("organization_id", 1).eq("user_id", userId);
  if (personId) await db().from("people").delete().eq("id", personId);
  if (userId) await db().auth.admin.deleteUser(userId);
  if (founderId) await db().auth.admin.deleteUser(founderId);
  if (staffIds.length) {
    await db().from("audit_log").delete().eq("target_table", "staff_members").in("target_id", staffIds.map(String));
    await db().from("staff_members").delete().in("id", staffIds);
  }
  if (userId) await db().from("audit_log").delete().eq("target_id", userId);
  if (founderId) await db().from("audit_log").delete().eq("actor_user_id", founderId);
});

describe("one person, one login", () => {
  it("gives a person already on the team a login on their own row", async () => {
    const id = await staffRow("Coach Quill", "coach");
    expect((await listStaffWithoutLogin()).map((row) => row.id)).toContain(id);

    const account = await assignStaffLogin({ id, accountKey: `test-quill-${tag}`, role: "coach", pin: "000000", actorName: MARK });
    expect(account).toMatchObject({ id, accountKey: `test-quill-${tag}`, role: "coach", active: true, pinChangedAt: null, canViewMedical: false });
    expect((await listStaffWithoutLogin()).map((row) => row.id)).not.toContain(id);
    expect((await listStaffAccounts()).filter((a) => a.name === `${MARK} Coach Quill`)).toHaveLength(1);

    const { data: audit } = await db().from("audit_log").select("action,after").eq("target_table", "staff_members").eq("target_id", String(id));
    expect(audit?.map((a) => a.action)).toContain("staff.login_given");
    expect(JSON.stringify(audit)).not.toContain("000000");
  });

  it("never touches a row that already has a login, and refuses a taken account name", async () => {
    const id = staffIds[0];
    await expect(assignStaffLogin({ id, accountKey: `test-quill2-${tag}`, role: "coach", pin: "111111", actorName: MARK })).rejects.toThrow("ROW_NOT_FOUND");
    const other = await staffRow("Coach Wren", "coach");
    await expect(assignStaffLogin({ id: other, accountKey: `test-quill-${tag}`, role: "coach", pin: "111111", actorName: MARK })).rejects.toThrow("ACCOUNT_KEY_TAKEN");
    await expect(assignStaffLogin({ id: other, accountKey: `test-wren-${tag}`, role: "coach", pin: "12", actorName: MARK })).rejects.toThrow("INVALID_PIN");
  });
});

describe("an admin's medical view", () => {
  it("is a switch, and every change leaves an audit line", async () => {
    const id = await staffRow("Desk", "admin", { account_key: `test-desk-${tag}`, pin_hash: "x" });
    await setStaffCanViewMedical(id, true, MARK);
    await setStaffCanViewMedical(id, false, MARK);
    const { data: row } = await db().from("staff_members").select("can_view_medical").eq("id", id).single();
    expect(row!.can_view_medical).toBe(false);
    const { data: audit } = await db().from("audit_log").select("action,after").eq("target_id", String(id)).eq("action", "staff.medical_view_changed").order("id");
    expect(audit?.map((a) => (a.after as { can_view_medical: boolean }).can_view_medical)).toEqual([true, false]);
  });
});

describe("the owner bridge", () => {
  // Pike and Lark are TEST CEO logins; ids are looked up by name, so the
  // steps don't depend on the order rows were made in.
  const idOf = (name: string) => staffIds.find((id) => names.get(id) === name)!;
  const members = async () => (await db().from("organization_members").select("id,role").eq("organization_id", 1).eq("user_id", userId)).data ?? [];
  const granted = async () => (await db().from("audit_log").select("after").eq("target_id", userId).eq("action", "membership.owner_granted")).data ?? [];
  const revoked = async () => ((await db().from("audit_log").select("after").eq("target_id", userId).eq("action", "membership.owner_revoked").order("id")).data ?? []).map((a) => (a.after as { reason: string }).reason);

  it("only a CEO login can be the owner", async () => {
    await expect(markFutprepOwner({ staffId: staffIds[0], actorName: MARK, actorRole: "ceo" })).rejects.toThrow("NOT_A_CEO");
  });

  it("marking from a staff login only asks, and the staff screen never learns whether an address has a sign-in", async () => {
    const pike = await staffRow("Owner Pike", "ceo", { account_key: `test-pike-${tag}`, pin_hash: "x" });
    expect(await markFutprepOwner({ staffId: pike, actorName: MARK, actorRole: "admin" })).toMatchObject({ state: "needs_email" });
    expect(await setFutprepStaffEmail({ staffId: pike, email: ownerEmail, actor: MARK })).toBe(true);
    expect(await markFutprepOwner({ staffId: pike, actorName: MARK, actorRole: "admin" })).toMatchObject({ state: "waiting", email: ownerEmail });
    expect(await futprepOwnerRequest()).toMatchObject({ staffId: pike, state: "needs_sign_in" });

    // Someone who has signed in to PortPass with that email.
    const created = await db().auth.admin.createUser({ email: ownerEmail, email_confirm: true });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const { data: person, error: personError } = await db().from("people").insert({ name: `${MARK} Owner Pike`, email: ownerEmail, auth_user_id: userId }).select("id").single();
    expect(personError).toBeNull();
    personId = Number(person!.id);

    expect(await markFutprepOwner({ staffId: pike, actorName: MARK, actorRole: "admin" })).toMatchObject({ state: "waiting" });
    expect(await futprepOwnerStaffState()).toEqual({ staffId: pike, state: "waiting" });
    expect(await futprepOwnerRequest()).toMatchObject({ staffId: pike, state: "waiting_for_founder", loginActive: true });
    expect(await members()).toEqual([]);
  });

  it("a founder's grant, for the email they saw, writes the owner membership with payments, once", async () => {
    const pike = idOf("Owner Pike");
    const founder = await db().auth.admin.createUser({ email: `test-delete-founder-${tag}@test.portpass.local`, email_confirm: true });
    expect(founder.error).toBeNull();
    founderId = founder.data.user!.id;

    expect(await grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).toMatchObject({ state: "granted" });
    const { data: membership } = await db().from("organization_members").select("id,role,can_manage_payments").eq("organization_id", 1).eq("user_id", userId).single();
    expect(membership).toMatchObject({ role: "org_owner", can_manage_payments: true });
    const { data: row } = await db().from("staff_members").select("owner_user_id,owner_member_id").eq("id", pike).single();
    expect(row).toEqual({ owner_user_id: userId, owner_member_id: membership!.id });
    expect(await futprepOwnerStaffState()).toEqual({ staffId: pike, state: "granted" });
    // Pressing again changes nothing.
    expect(await grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).toMatchObject({ state: "granted" });
    expect(await granted()).toHaveLength(1);
    const { data: audit } = await db().from("audit_log").select("actor_user_id").eq("target_id", userId).eq("action", "membership.owner_granted");
    expect(audit).toEqual([{ actor_user_id: founderId }]);
  });

  it("an email change takes the access back at once, and a grant for the email the founder saw is then refused", async () => {
    const pike = idOf("Owner Pike");
    const other = `test-delete-other-${tag}@test.portpass.local`;
    expect(await setFutprepStaffEmail({ staffId: pike, email: other, actor: MARK })).toBe(true);
    expect(await members()).toEqual([]);
    expect(await revoked()).toEqual(["email_changed"]);
    const { data: changed } = await db().from("audit_log").select("before,after").eq("target_id", String(pike)).eq("action", "staff.email_changed").order("id", { ascending: false }).limit(1).single();
    expect(JSON.stringify(changed)).not.toContain("@");
    await expect(grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).rejects.toThrow(/EMAIL_CHANGED|NO_SIGN_IN/);
    // Saving the same address again is not a change.
    expect(await setFutprepStaffEmail({ staffId: pike, email: other.toUpperCase(), actor: MARK })).toBe(false);
    expect(await setFutprepStaffEmail({ staffId: pike, email: ownerEmail, actor: MARK })).toBe(true);
    expect(await grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).toMatchObject({ state: "granted" });
  });

  it("only the CEO login moves the mark, and moving it takes the earlier owner's access back", async () => {
    const pike = idOf("Owner Pike");
    const lark = await staffRow("Owner Lark", "ceo", { account_key: `test-lark-${tag}`, pin_hash: "x" });
    await expect(markFutprepOwner({ staffId: lark, actorName: MARK, actorRole: "admin" })).rejects.toThrow("CEO_ONLY_MOVE");
    expect(await members()).toHaveLength(1);

    await markFutprepOwner({ staffId: lark, actorName: MARK, actorRole: "ceo" });
    const { data: owners } = await db().from("staff_members").select("id").eq("organization_id", 1).eq("is_owner", true);
    expect(owners?.map((o) => Number(o.id))).toEqual([lark]);
    expect(await members()).toEqual([]);
    const { data: row } = await db().from("staff_members").select("owner_user_id,owner_member_id").eq("id", pike).single();
    expect(row).toEqual({ owner_user_id: null, owner_member_id: null });
    expect((await revoked()).pop()).toBe("mark_moved");
    // A grant can't land on the login that lost the mark.
    await expect(grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).rejects.toThrow("NOT_MARKED");
  });

  it("a switched-off login loses the access and can't be granted it", async () => {
    const pike = idOf("Owner Pike");
    await markFutprepOwner({ staffId: pike, actorName: MARK, actorRole: "ceo" });
    expect(await grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).toMatchObject({ state: "granted" });
    await db().from("staff_members").update({ active: false }).eq("id", pike);
    expect(await revokeFutprepOwnerGrant({ staffId: pike, reason: "login_switched_off", actor: MARK })).toBe(true);
    expect(await members()).toEqual([]);
    await expect(grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).rejects.toThrow("NOT_MARKED");
    // Nothing recorded, nothing to take back.
    expect(await revokeFutprepOwnerGrant({ staffId: pike, reason: "login_switched_off", actor: MARK })).toBe(false);
    await db().from("staff_members").update({ active: true }).eq("id", pike);
  });

  it("never takes back a membership a founder changed or remade in People", async () => {
    const pike = idOf("Owner Pike");
    expect(await grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).toMatchObject({ state: "granted" });
    const [made] = await members();

    // A founder makes the grant an admin membership in People: the record
    // still points at it, but it is no longer the grant, so it stays.
    await db().from("organization_members").update({ role: "org_admin" }).eq("id", made.id);
    expect(await revokeFutprepOwnerGrant({ staffId: pike, reason: "email_changed", actor: MARK })).toBe(false);
    expect(await members()).toEqual([{ id: made.id, role: "org_admin" }]);
    await expect(grantFutprepOwner({ staffId: pike, email: ownerEmail, founderUserId: founderId })).rejects.toThrow("ALREADY_MEMBER");

    // A founder removes it and the person comes back as an owner by
    // invitation: a new membership, never the grant's.
    await db().from("organization_members").delete().eq("id", made.id);
    const { data: invited } = await db().from("organization_members").insert({ organization_id: 1, user_id: userId, role: "org_owner", can_view_medical: true }).select("id").single();
    expect(await revokeFutprepOwnerGrant({ staffId: pike, reason: "login_switched_off", actor: MARK })).toBe(false);
    expect(await members()).toEqual([{ id: invited!.id, role: "org_owner" }]);
    expect(await futprepOwnerStaffState()).toEqual({ staffId: pike, state: "waiting" });
  });

  it("browser roles can't call the owner functions", async () => {
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!anonKey) return;
    const anon = createClient(process.env.SUPABASE_URL!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const pike = idOf("Owner Pike");
    // Refused at the function, not merely by the table it touches.
    const refused = (error: { message?: string } | null) => expect(error?.message ?? "").toMatch(/permission denied for function/);
    refused((await anon.rpc("futprep_owner_grant", { p_org: 1, p_staff_id: pike, p_email: ownerEmail, p_user: userId, p_founder: userId })).error);
    refused((await anon.rpc("futprep_owner_revoke", { p_org: 1, p_staff_id: pike, p_reason: "x", p_actor: "x" })).error);
    refused((await anon.rpc("futprep_staff_set_email", { p_org: 1, p_staff_id: pike, p_email: "x@example.com", p_actor: "x" })).error);
  });
});

describe("the Team page's chips", () => {
  it("says what a coach's login still needs, and carries no PIN hash", async () => {
    const id = await staffRow("Chip coach", "coach", { account_key: `test-chip-${tag}`, pin_hash: "test-not-a-real-hash" });
    // The coach is Futprep's (the business with slug futprep): the Team list
    // shows Futprep's own coaches only. Its login stays on organisation 1,
    // where staff-auth reads Futprep's staff; in production both are 1.
    const { data: futprep } = await db().from("organizations").select("id").eq("slug", "futprep").single();
    const { data: coach, error } = await db().from("coach_profiles").insert({ organization_id: Number(futprep!.id), slug: `test-delete-chip-${tag}`, display_name: `${MARK} Chip coach`, member_type: "coach", active: true, public_visible: false, bookable: false, staff_member_id: id }).select("id").single();
    expect(error).toBeNull();
    coachId = Number(coach!.id);
    const { coaches } = await listAllCoachProfiles({ withLogin: true });
    const listed = coaches.find((c) => c.id === coachId)!;
    expect(listed.login).toEqual({ linked: true, staffName: `${MARK} Chip coach`, role: "coach", hasEmail: false, hasPin: true, active: true });
    expect(JSON.stringify(coaches)).not.toContain("test-not-a-real-hash");
  });
});
