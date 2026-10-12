import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nassauToday } from "@/lib/futprepTerms";
import { addDays } from "@/lib/paymentRequests/rules";
import { createDraftBusiness } from "./business";
import { expirePoints, getMyPoints } from "./points";

// PortPass Points (brief 25, part D) against the local Supabase stack: a
// TEST guardian with a PortPass account, a TEST child's registration, a
// TEST Market order, a TEST staff member of the business, and a second
// TEST account that must see none of it. Everything is deleted afterwards;
// nothing is sent.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6).replace(/[^a-z0-9]/g, "x");
const MARK = "TEST — delete";
const today = nassauToday();
const guardianEmail = `test-delete-points-guardian-${tag}@test.portpass.local`;
const otherEmail = `test-delete-points-other-${tag}@test.portpass.local`;
const staffEmail = `test-delete-points-staff-${tag}@test.portpass.local`;
let guardian = "";
let other = "";
let staff = "";
const personIds: number[] = [];
let orgId = 0;
let programId = 0;
let registrationId = 0;
let unlinkedRegistrationId = 0;
let staffRegistrationId = 0;
let orderId = 0;
const sessionIds: number[] = [];

async function account(userId: string) {
  const { data } = await admin.from("points_accounts").select("id,balance").eq("user_id", userId).maybeSingle();
  return data;
}

async function events(userId: string) {
  const acct = await account(userId);
  if (!acct) return [];
  const { data } = await admin.from("points_events").select("*").eq("account_id", acct.id).order("id", { ascending: true });
  return data ?? [];
}

function browserFor(email: string) {
  return (async () => {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await browser.auth.verifyOtp({ email, token: link.data.properties!.email_otp, type: "email" });
    if (signedIn.error) throw new Error(`could not sign in the TEST account: ${signedIn.error.message}`);
    return browser;
  })();
}

beforeAll(async () => {
  const made = await Promise.all([guardianEmail, otherEmail, staffEmail].map((email) => admin.auth.admin.createUser({ email, email_confirm: true })));
  for (const m of made) if (m.error || !m.data.user) throw new Error("could not create the TEST accounts");
  [guardian, other, staff] = made.map((m) => m.data.user!.id);
  for (const [email, userId] of [[guardianEmail, guardian], [staffEmail, staff]]) {
    const { data: person, error } = await admin.from("people").insert({ name: `${MARK} Person`, email, auth_user_id: userId }).select("id").single();
    if (error || !person) throw new Error(`could not create a TEST person: ${error?.message}`);
    personIds.push(Number(person.id));
  }
  orgId = (await createDraftBusiness({ name: `${MARK} Points Biz ${tag}`, section: "sports-fitness", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: guardian })).id;
  // The business's own staff member: never earns on this business.
  const member = await admin.from("organization_members").insert({ organization_id: orgId, user_id: staff, role: "org_staff" });
  if (member.error) throw new Error(`could not add the TEST staff member: ${member.error.message}`);

  const { data: program, error: programError } = await admin
    .from("programs")
    .insert({ organization_id: orgId, slug: `test-delete-points-${tag}`, name: "TEST Kickers", age_min: 3, age_max: 6, location: "TEST field", day_of_week: "Saturday", start_time: "10:00 AM", capacity: 20, is_public: false })
    .select("id")
    .single();
  if (programError || !program) throw new Error(`could not create the TEST programme: ${programError?.message}`);
  programId = Number(program.id);
  const { data: term, error: termError } = await admin.from("program_terms").insert({ program_id: programId, name: "TEST Term", start_date: addDays(today, -30), end_date: addDays(today, 40), weekly_fee_cents: 4500, term_fee_cents: 42000 }).select("id").single();
  if (termError || !term) throw new Error(`could not create the TEST term: ${termError?.message}`);
  const { data: sessions } = await admin.from("sessions").select("id").eq("term_id", term.id).order("session_date", { ascending: true }).limit(3);
  for (const s of sessions ?? []) sessionIds.push(Number(s.id));
  if (sessionIds.length < 2) throw new Error("the TEST term has too few sessions");

  const registration = (first: string, parentPersonId: number | null) => ({
    reference_code: `FP-TESTP-${first.slice(0, 1)}${tag.toUpperCase()}`, organization_id: orgId, program_id: programId, term_id: term.id,
    parent_name: `${MARK} Guardian`, parent_email: guardianEmail, parent_phone: "242-555-0109", parent_person_id: parentPersonId,
    child_name: `${first} TEST`, payment_frequency: "weekly", amount_due_cents: 4500,
    registration_status: "confirmed", payment_status: "pending", consent_version: "test", consent_accepted: true, submitted_at: new Date().toISOString(),
  });
  const { data: regs, error: regError } = await admin.from("registrations").insert([registration("Amara", personIds[0]), registration("Bodie", null), registration("Cleo", personIds[1])]).select("id,child_name");
  if (regError || !regs) throw new Error(`could not create the TEST registrations: ${regError?.message}`);
  const idOf = (first: string) => Number(regs.find((r) => String(r.child_name).startsWith(first))!.id);
  registrationId = idOf("Amara");
  unlinkedRegistrationId = idOf("Bodie");
  staffRegistrationId = idOf("Cleo");
});

afterAll(async () => {
  if (orderId) await admin.from("reservations").delete().eq("id", orderId);
  if (sessionIds.length) await admin.from("attendance").delete().in("session_id", sessionIds);
  await admin.from("registrations").delete().in("id", [registrationId, unlinkedRegistrationId, staffRegistrationId].filter(Boolean));
  if (programId) await admin.from("programs").delete().eq("id", programId);
  if (personIds.length) await admin.from("people").delete().in("id", personIds);
  if (orgId) {
    await admin.from("organization_members").delete().eq("organization_id", orgId);
    await admin.from("audit_log").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  // Points accounts and their events go with the accounts.
  for (const id of [guardian, other, staff].filter(Boolean)) await admin.auth.admin.deleteUser(id);
});

describe("earning by attending", () => {
  it("credits the guardian's own account once per registration, with nothing about the child", async () => {
    await admin.from("attendance").insert({ registration_id: registrationId, session_id: sessionIds[0], status: "present", marked_by: MARK });
    await admin.from("attendance").insert({ registration_id: registrationId, session_id: sessionIds[1], status: "late", marked_by: MARK });
    expect((await account(guardian))?.balance).toBe(10);
    const list = await events(guardian);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: "booking_attended", ref_type: "registration", ref_id: registrationId, organization_id: orgId, delta: 10 });
    expect(JSON.stringify(list)).not.toContain("Amara");
  });

  it("takes the points back when the last mark is undone, and gives them again when it is marked again", async () => {
    await admin.from("attendance").update({ status: "absent" }).eq("registration_id", registrationId).eq("session_id", sessionIds[1]);
    expect((await account(guardian))?.balance).toBe(10); // still attended the first session
    await admin.from("attendance").delete().eq("registration_id", registrationId).eq("session_id", sessionIds[0]);
    expect((await account(guardian))?.balance).toBe(0);
    await admin.from("attendance").update({ status: "present" }).eq("registration_id", registrationId).eq("session_id", sessionIds[1]);
    expect((await account(guardian))?.balance).toBe(10);
    expect((await events(guardian)).map((e) => `${e.reason}:${e.delta}`)).toEqual(["booking_attended:10", "manual_adjust:-10", "booking_attended:10"]);
  });

  it("credits nothing for a registration with no PortPass account behind it, or to the business's own team", async () => {
    await admin.from("attendance").insert({ registration_id: unlinkedRegistrationId, session_id: sessionIds[0], status: "present", marked_by: MARK });
    await admin.from("attendance").insert({ registration_id: staffRegistrationId, session_id: sessionIds[0], status: "present", marked_by: MARK });
    expect(await account(staff)).toBeNull();
    expect(await account(other)).toBeNull();
  });

  it("stores no child identifier anywhere: the ledger has no column that could hold one", async () => {
    const { data: row } = await admin.from("points_events").select("*").limit(1).maybeSingle();
    const columns = Object.keys(row ?? {}).sort();
    expect(columns).toEqual(["account_id", "created_at", "created_by", "delta", "expired_at", "expires_at", "id", "organization_id", "reason", "ref_id", "ref_type"]);
  });
});

describe("earning by ordering on the Market", () => {
  it("credits a dollar's worth while the order is paid: taken back if not, given again if paid again", async () => {
    const { data: order, error } = await admin
      .from("reservations")
      .insert({ kind: "order", reference_code: `TPT-${tag.toUpperCase().padEnd(6, "X").slice(0, 6)}`, receipt_token: crypto.randomUUID().replace(/-/g, "") + "abcd", organization_id: orgId, buyer_name: `${MARK} Guardian`, buyer_phone: "+12425550109", buyer_email: guardianEmail.toUpperCase(), items: [{ variantId: 1, productId: 1, title: "TEST", label: "S", qty: 1, unitCents: 3550 }], subtotal_cents: 3550, delivery_fee_cents: 0, total_cents: 3550, payment_method: "cash", fulfilment: "pickup", hold_until: new Date(Date.now() + 86_400_000).toISOString() })
      .select("id")
      .single();
    if (error || !order) throw new Error(`could not create the TEST order: ${error?.message}`);
    orderId = Number(order.id);
    // The email matches as the sign-in matches it, whatever its case.
    await admin.from("reservations").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
    expect((await account(guardian))?.balance).toBe(10 + 35);
    await admin.from("reservations").update({ payment_status: "pending", paid_at: null }).eq("id", orderId);
    expect((await account(guardian))?.balance).toBe(10);
    await admin.from("reservations").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
    expect((await account(guardian))?.balance).toBe(10 + 35);
    const orderEvents = (await events(guardian)).filter((e) => e.ref_type === "reservation").map((e) => `${e.reason}:${e.delta}`);
    expect(orderEvents).toEqual(["order_paid:35", "manual_adjust:-35", "order_paid:35"]);
  });
});

describe("expiry", () => {
  it("takes standing earnings off 12 months later, once, and never one already taken back", async () => {
    const acct = await account(guardian);
    await admin.from("points_events").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("account_id", acct!.id).gt("delta", 0);
    expect(await expirePoints()).toBeGreaterThanOrEqual(2);
    expect((await account(guardian))?.balance).toBe(0);
    await expirePoints();
    expect((await account(guardian))?.balance).toBe(0);
    // Expired earnings don't come back off again if the order is no longer paid.
    await admin.from("reservations").update({ payment_status: "pending", paid_at: null }).eq("id", orderId);
    expect((await account(guardian))?.balance).toBe(0);
  });
});

describe("who can read it", () => {
  it("shows the account holder their own points and history on the account page", async () => {
    const mine = await getMyPoints(guardian);
    expect(mine.balance).toBe(0);
    expect(mine.events.map((e) => e.reason)).toContain("booking_attended");
    expect(mine.events.find((e) => e.reason === "booking_attended")?.businessName).toContain("Points Biz");
    expect((await getMyPoints(other)).events).toEqual([]);
  });

  it("lets a signed-in account read its own rows and no one else's, and never write or call the points functions", async () => {
    const mine = await browserFor(guardianEmail);
    expect(((await mine.from("points_events").select("id")).data ?? []).length).toBeGreaterThan(0);
    const theirs = await browserFor(otherEmail);
    expect((await theirs.from("points_events").select("id")).data ?? []).toEqual([]);
    expect((await theirs.from("points_accounts").select("id")).data ?? []).toEqual([]);
    expect((await theirs.from("points_events").insert({ account_id: 1, delta: 1000, reason: "manual_adjust" })).error).not.toBeNull();
    expect((await theirs.rpc("points_expire")).error).not.toBeNull();
    expect((await theirs.rpc("points_settle", { p_user_id: other, p_ref_type: "registration", p_ref_id: 1, p_earned: true, p_amount: 1000, p_reason: "booking_attended", p_organization_id: null })).error).not.toBeNull();
    expect(await account(other)).toBeNull();
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("points_events").select("id").limit(1)).data ?? []).toEqual([]);
  });
});
