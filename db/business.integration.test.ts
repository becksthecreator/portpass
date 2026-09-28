import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDraftBusiness,
  createInvite,
  getBusiness,
  listBusinessOfferings,
  submissionProblems,
  submitBusiness,
  uniqueBusinessSlug,
  updateBusinessDetails,
  updatePaymentMethods,
  upsertBusinessOffering,
} from "./business";

// Exercises the wizard's data rules against the local Supabase stack:
// slugs avoid reserved names and subcategories, "no price, no publish",
// approving + first price takes a business live, bank-detail changes are
// audited, and submit refuses an incomplete draft.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
let userId = "";
let orgId = 0;

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `owner-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`, email_confirm: true });
  expect(created.error).toBeNull();
  userId = created.data.user!.id;
  await admin.from("profiles").upsert({ user_id: userId, full_name: "TEST — delete owner" });
});

// audit_log rows reference the organization and the actor without cascade
// (they're meant to outlive both), so they go first, then the org (which
// cascades members, invites, offerings), then the user.
afterAll(async () => {
  if (orgId) {
    await admin.from("audit_log").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error).toBeNull();
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    expect(error).toBeNull();
  }
});

describe("owner wizard data rules", () => {
  it("never hands out a reserved or subcategory slug", async () => {
    expect(await uniqueBusinessSlug("Admin", "sports-fitness")).not.toBe("admin");
    expect(await uniqueBusinessSlug("Tennis", "sports-fitness")).not.toBe("tennis");
    expect(await uniqueBusinessSlug("DJs", "entertainment")).not.toBe("djs");
  });

  it("creates a draft owned by the creator", async () => {
    const business = await createDraftBusiness({ name: "TEST — delete Paddle Club", section: "sports-fitness", subcategory: "padel", ownerUserId: userId, actorUserId: userId });
    orgId = business.id;
    expect(business.status).toBe("draft");
    expect(business.slug).toMatch(/^test-delete-paddle-club/);
    const { data: member } = await admin.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", userId).single();
    expect(member!.role).toBe("org_owner");
  });

  it("refuses to submit an incomplete draft, then accepts a complete one", async () => {
    await expect(submitBusiness(orgId, userId)).rejects.toMatchObject({ message: "INCOMPLETE" });

    await updateBusinessDetails(orgId, { oneLiner: "Padel courts by the hour.", whatsappE164: "+12425550100" }, userId);
    await updatePaymentMethods(orgId, userId, { paymentMethods: ["cash"], bankTransferDetails: null });
    const draft = await upsertBusinessOffering(orgId, null, { name: "Court hire", summary: null, priceCents: null, priceUnit: null, scheduleText: "60 minutes", capacity: 4, type: "venue" }, userId);
    expect(draft.isPublished).toBe(false);
    expect(submissionProblems((await getBusiness(orgId))!, await listBusinessOfferings(orgId))).toEqual([]);

    const submitted = await submitBusiness(orgId, userId);
    expect(submitted.status).toBe("submitted");
  });

  it("goes live when an approved business gets its first priced offering", async () => {
    await admin.from("organizations").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", orgId);
    const offerings = await listBusinessOfferings(orgId);
    const priced = await upsertBusinessOffering(orgId, offerings[0].id, { name: "Court hire", summary: null, priceCents: 4000, priceUnit: "per_hour", scheduleText: "60 minutes", capacity: 4, type: "venue" }, userId);
    expect(priced.isPublished).toBe(true);
    const business = (await getBusiness(orgId))!;
    expect(business).toMatchObject({ status: "live", isPublished: true });
  });

  it("audits and re-reviews a bank-detail change on a live business", async () => {
    const { bankDetailsChanged, business } = await updatePaymentMethods(orgId, userId, {
      paymentMethods: ["cash", "bank_transfer"],
      bankTransferDetails: { bank: "Test Bank", accountName: "TEST — delete", accountNumber: "0000-1111", branch: "", instructions: "" },
    });
    expect(bankDetailsChanged).toBe(true);
    expect(business.status).toBe("submitted");
    const { data: audit } = await admin.from("audit_log").select("action,before,after").eq("organization_id", orgId).eq("action", "organization.bank_details.updated").order("id", { ascending: false }).limit(1).single();
    expect(audit).toBeTruthy();
    expect((audit!.after as { bank_transfer_details: { accountNumber: string } }).bank_transfer_details.accountNumber).toBe("0000-1111");
  });

  it("stores only the invite token's hash", async () => {
    const { invite, token } = await createInvite(orgId, { email: "coach@test.portpass.local", role: "org_staff", canViewMedical: true, invitedBy: userId });
    expect(invite.canViewMedical).toBe(true);
    const { data: row } = await admin.from("organization_invites").select("token_hash").eq("id", invite.id).single();
    expect(row!.token_hash).not.toBe(token);
    expect(row!.token_hash).toHaveLength(64);
  });
});
