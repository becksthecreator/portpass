import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignStaffLogin, listStaffAccounts, listStaffWithoutLogin, setStaffCanViewMedical } from "@/app/futprep/staff-auth";
import { listAllCoachProfiles } from "./coaches";
import { futprepOwnerRequest, grantFutprepOwner, markFutprepOwner, revokeFutprepOwnerGrant } from "./futprepOwner";

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
let coachId = 0;
let userId = "";
let personId = 0;
const ownerEmail = `test-delete-owner-${tag}@test.portpass.local`;
let founderId = "";

async function staffRow(name: string, role: string, extra: Record<string, unknown> = {}): Promise<number> {
  const { data, error } = await db().from("staff_members").insert({ organization_id: 1, name: `${MARK} ${name}`, role, responsibilities: "", active: true, ...extra }).select("id").single();
  expect(error).toBeNull();
  staffIds.push(Number(data!.id));
  return Number(data!.id);
}

beforeAll(async () => {
  const url = process.env.SUPABASE_URL ?? "";
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to run against anything but a local Supabase stack.");
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
  it("only a CEO login can be the owner", async () => {
    const coach = staffIds[0];
    await expect(markFutprepOwner({ staffId: coach, actorName: MARK })).rejects.toThrow("NOT_A_CEO");
  });

  it("marking from a staff login only asks: it never writes a membership, even once the person has signed in", async () => {
    const ceo = await staffRow("Owner Pike", "ceo", { account_key: `test-pike-${tag}`, pin_hash: "x" });
    expect(await markFutprepOwner({ staffId: ceo, actorName: MARK })).toMatchObject({ state: "needs_email" });
    const { data: marked } = await db().from("staff_members").select("is_owner").eq("id", ceo).single();
    expect(marked!.is_owner).toBe(true);

    await db().from("staff_members").update({ email: ownerEmail }).eq("id", ceo);
    expect(await markFutprepOwner({ staffId: ceo, actorName: MARK })).toMatchObject({ state: "needs_sign_in", email: ownerEmail });

    // Someone who has signed in to PortPass with that email.
    const created = await db().auth.admin.createUser({ email: ownerEmail, email_confirm: true });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const { data: person, error: personError } = await db().from("people").insert({ name: `${MARK} Owner Pike`, email: ownerEmail, auth_user_id: userId }).select("id").single();
    expect(personError).toBeNull();
    personId = Number(person!.id);

    expect(await markFutprepOwner({ staffId: ceo, actorName: MARK })).toMatchObject({ state: "waiting_for_founder" });
    const { data: none } = await db().from("organization_members").select("role").eq("organization_id", 1).eq("user_id", userId);
    expect(none).toEqual([]);
    expect(await futprepOwnerRequest()).toMatchObject({ staffId: ceo, state: "waiting_for_founder", loginActive: true });
  });

  it("a founder's grant writes the owner membership with payments, once", async () => {
    const ceo = staffIds[staffIds.length - 1];
    const founder = await db().auth.admin.createUser({ email: `test-delete-founder-${tag}@test.portpass.local`, email_confirm: true });
    expect(founder.error).toBeNull();
    founderId = founder.data.user!.id;

    expect(await grantFutprepOwner({ staffId: ceo, founderUserId: founderId })).toMatchObject({ state: "granted" });
    const { data: membership } = await db().from("organization_members").select("role,can_manage_payments").eq("organization_id", 1).eq("user_id", userId).single();
    expect(membership).toEqual({ role: "org_owner", can_manage_payments: true });
    const { data: row } = await db().from("staff_members").select("owner_user_id").eq("id", ceo).single();
    expect(row!.owner_user_id).toBe(userId);
    // Pressing again changes nothing.
    expect(await grantFutprepOwner({ staffId: ceo, founderUserId: founderId })).toMatchObject({ state: "granted" });
    const { data: audit } = await db().from("audit_log").select("action,actor_user_id").eq("target_id", userId).eq("action", "membership.owner_granted");
    expect(audit).toEqual([{ action: "membership.owner_granted", actor_user_id: founderId }]);
  });

  it("moving the mark takes the earlier owner's access back: one owner at a time", async () => {
    const first = staffIds[staffIds.length - 1];
    const second = await staffRow("Owner Lark", "ceo", { account_key: `test-lark-${tag}`, pin_hash: "x" });
    await markFutprepOwner({ staffId: second, actorName: MARK });
    const { data: owners } = await db().from("staff_members").select("id").eq("organization_id", 1).eq("is_owner", true);
    expect(owners?.map((o) => Number(o.id))).toEqual([second]);
    const { data: membership } = await db().from("organization_members").select("role").eq("organization_id", 1).eq("user_id", userId);
    expect(membership).toEqual([]);
    const { data: row } = await db().from("staff_members").select("owner_user_id").eq("id", first).single();
    expect(row!.owner_user_id).toBeNull();
    const { data: audit } = await db().from("audit_log").select("after").eq("target_id", userId).eq("action", "membership.owner_revoked");
    expect(audit?.map((a) => (a.after as { reason: string }).reason)).toEqual(["mark_moved"]);
  });

  it("switching the owner's login off takes the access back, and a grant needs a marked, active login", async () => {
    const first = staffIds[staffIds.length - 2];
    const second = staffIds[staffIds.length - 1];
    await markFutprepOwner({ staffId: first, actorName: MARK });
    expect(await grantFutprepOwner({ staffId: first, founderUserId: founderId })).toMatchObject({ state: "granted" });
    await expect(grantFutprepOwner({ staffId: second, founderUserId: founderId })).rejects.toThrow("NOT_MARKED");

    expect(await revokeFutprepOwnerGrant({ staffId: first, reason: "login_switched_off", actor: MARK })).toBe(true);
    const { data: membership } = await db().from("organization_members").select("role").eq("organization_id", 1).eq("user_id", userId);
    expect(membership).toEqual([]);
    // Nothing recorded, nothing to take back.
    expect(await revokeFutprepOwnerGrant({ staffId: first, reason: "login_switched_off", actor: MARK })).toBe(false);
  });

  it("never touches a membership made another way", async () => {
    const first = staffIds[staffIds.length - 2];
    await db().from("organization_members").insert({ organization_id: 1, user_id: userId, role: "org_admin", can_view_medical: false });
    await expect(grantFutprepOwner({ staffId: first, founderUserId: founderId })).rejects.toThrow("ALREADY_MEMBER");
    expect(await revokeFutprepOwnerGrant({ staffId: first, reason: "email_changed", actor: MARK })).toBe(false);
    const { data: membership } = await db().from("organization_members").select("role").eq("organization_id", 1).eq("user_id", userId).single();
    expect(membership).toEqual({ role: "org_admin" });
  });
});

describe("the Team page's chips", () => {
  it("says what a coach's login still needs, and carries no PIN hash", async () => {
    const id = await staffRow("Chip coach", "coach", { account_key: `test-chip-${tag}`, pin_hash: "test-not-a-real-hash" });
    const { data: coach, error } = await db().from("coach_profiles").insert({ organization_id: 1, slug: `test-delete-chip-${tag}`, display_name: `${MARK} Chip coach`, member_type: "coach", active: true, public_visible: false, bookable: false, staff_member_id: id }).select("id").single();
    expect(error).toBeNull();
    coachId = Number(coach!.id);
    const { coaches } = await listAllCoachProfiles({ withLogin: true });
    const listed = coaches.find((c) => c.id === coachId)!;
    expect(listed.login).toEqual({ linked: true, staffName: `${MARK} Chip coach`, role: "coach", hasEmail: false, hasPin: true, active: true });
    expect(JSON.stringify(coaches)).not.toContain("test-not-a-real-hash");
  });
});
