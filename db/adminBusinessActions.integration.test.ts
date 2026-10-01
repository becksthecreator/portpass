import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveBusiness, claimBusiness, claimLinkInfo, createClaimLink, draftBusinessFromApplication, publishForOwner, sendBackBusiness, suspendBusiness, unsuspendBusiness } from "./adminBusinessActions";
import { createApplication } from "./applications";
import { createDraftBusiness, getBusiness, submitBusiness, updateBusinessDetails, updatePaymentMethods, upsertBusinessOffering } from "./business";

// Admin Control Center, Businesses (brief 08, 1.2 and 1.3) against CI's
// local Supabase stack: approve, send back, suspend and unsuspend, publish
// for an owner, claim links, and a draft from a get listed request. Every
// business and person is "TEST — delete" and removed afterwards.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let founder = "";
let owner = "";
const made: number[] = [];

async function user(label: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email: `test-delete-${label}-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  await admin.from("profiles").upsert({ user_id: created.data.user.id, full_name: `TEST delete ${label}` });
  return created.data.user.id;
}

// A complete draft: everything "submit" asks for, with one offering.
async function business(name: string, options: { priced: boolean; ownerUserId: string | null; createdByAdmin?: boolean }): Promise<number> {
  const draft = await createDraftBusiness({ name: `TEST delete ${TAG} ${name}`, section: "entertainment", subcategory: null, ownerUserId: options.ownerUserId, createdByAdmin: options.createdByAdmin ?? false, actorUserId: founder });
  made.push(draft.id);
  await updateBusinessDetails(draft.id, { oneLiner: "TEST one line.", whatsappE164: "+12425550100" }, founder);
  await updatePaymentMethods(draft.id, founder, { paymentMethods: ["cash"], bankTransferDetails: null });
  await upsertBusinessOffering(draft.id, null, { name: "TEST offering", summary: null, priceCents: options.priced ? 5000 : null, priceUnit: null, scheduleText: null, capacity: null, type: "service" }, founder);
  return draft.id;
}

const flags = async (id: number) => (await admin.from("organizations").select("status,is_published,is_directory_listed,review_note,suspended_reason,suspended_from,claimed_at").eq("id", id).single()).data!;
const actions = async (id: number) => ((await admin.from("audit_log").select("action").eq("organization_id", id)).data ?? []).map((row) => row.action as string);

beforeAll(async () => {
  founder = await user("founder");
  owner = await user("owner");
});

afterAll(async () => {
  // A business points at the request it came from, so businesses go first.
  for (const id of made) {
    await admin.from("audit_log").delete().eq("organization_id", id);
    await admin.from("organizations").delete().eq("id", id);
  }
  await admin.from("applications").delete().like("organization_name", `TEST delete ${TAG}%`);
  for (const id of [founder, owner]) {
    if (!id) continue;
    await admin.from("audit_log").delete().eq("actor_user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe("approve and send back", () => {
  it("approves a submitted business, and it goes live at once when it has a price", async () => {
    const id = await business("Priced", { priced: true, ownerUserId: owner });
    await expect(approveBusiness(id, founder)).rejects.toThrow("NOT_SUBMITTED");
    await submitBusiness(id, owner);
    const approved = await approveBusiness(id, founder);
    expect(approved).toMatchObject({ status: "live", isPublished: true });
    expect(await flags(id)).toMatchObject({ status: "live", is_published: true, is_directory_listed: true });
    expect(await actions(id)).toEqual(expect.arrayContaining(["business.approved", "business.went_live"]));
  });

  it("approves a business with no price yet, which waits as approved", async () => {
    const id = await business("Unpriced", { priced: false, ownerUserId: owner });
    await submitBusiness(id, owner);
    expect(await approveBusiness(id, founder)).toMatchObject({ status: "approved", isPublished: false });
  });

  it("sends a business back with a note the owner sees, and sending it again clears the note", async () => {
    const id = await business("Sent Back", { priced: true, ownerUserId: owner });
    await submitBusiness(id, owner);
    await expect(sendBackBusiness(id, "   ", founder)).rejects.toThrow("NOTE_REQUIRED");
    const back = await sendBackBusiness(id, "Please add your opening hours.", founder);
    expect(back).toMatchObject({ status: "draft", reviewNote: "Please add your opening hours." });
    expect(await actions(id)).toContain("business.sent_back");
    expect((await submitBusiness(id, owner)).reviewNote).toBeNull();
  });
});

describe("suspend and unsuspend", () => {
  it("hides a live business everywhere, and puts it back as it was", async () => {
    const id = await business("Suspended", { priced: true, ownerUserId: owner });
    await submitBusiness(id, owner);
    await approveBusiness(id, founder);
    await expect(suspendBusiness(id, "", founder)).rejects.toThrow("REASON_REQUIRED");

    const suspended = await suspendBusiness(id, "TEST complaint being looked into.", founder);
    expect(suspended).toMatchObject({ status: "suspended", isPublished: false });
    // Both switches are off, not only the status: nothing public still shows it.
    expect(await flags(id)).toMatchObject({ status: "suspended", is_published: false, is_directory_listed: false, suspended_reason: "TEST complaint being looked into.", suspended_from: { status: "live", is_published: true, is_directory_listed: true } });
    await expect(suspendBusiness(id, "again", founder)).rejects.toThrow("NOT_SUSPENDABLE");

    const back = await unsuspendBusiness(id, founder);
    expect(back).toMatchObject({ status: "live", isPublished: true });
    expect(await flags(id)).toMatchObject({ status: "live", is_published: true, is_directory_listed: true, suspended_reason: null, suspended_from: null });
    expect(await actions(id)).toEqual(expect.arrayContaining(["business.suspended", "business.unsuspended"]));
    await expect(unsuspendBusiness(id, founder)).rejects.toThrow("NOT_SUSPENDED");
  });
});

describe("a business PortPass builds for an owner", () => {
  it("can't be published until it is complete, then goes live on the owner's word, logged as such", async () => {
    const bare = await createDraftBusiness({ name: `TEST delete ${TAG} Bare`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder });
    made.push(bare.id);
    await expect(publishForOwner(bare.id, founder)).rejects.toMatchObject({ message: "INCOMPLETE" });

    const id = await business("Concierge", { priced: true, ownerUserId: null, createdByAdmin: true });
    expect(await publishForOwner(id, founder)).toMatchObject({ status: "live", isPublished: true });
    expect(await actions(id)).toContain("business.published_for_owner");
    await expect(publishForOwner(id, founder)).rejects.toThrow("NOT_PUBLISHABLE");
  });

  it("is handed over with a one-use claim link", async () => {
    const id = await business("Claimed", { priced: true, ownerUserId: null, createdByAdmin: true });
    const first = await createClaimLink(id, founder);
    const { token } = await createClaimLink(id, founder);
    // Only a hash is stored, and a new link switches the earlier one off.
    const { data: links } = await admin.from("organization_claim_links").select("token_hash").eq("organization_id", id);
    expect(links).toHaveLength(1);
    expect(links![0].token_hash).not.toContain(token);
    expect(await claimLinkInfo(first.token)).toBeNull();
    expect(await claimLinkInfo(token)).toMatchObject({ organizationId: id, state: "open" });
    expect(await claimLinkInfo("not-a-token")).toBeNull();

    const claimed = await claimBusiness(token, owner);
    expect(claimed.organizationId).toBe(id);
    const { data: member } = await admin.from("organization_members").select("role").eq("organization_id", id).eq("user_id", owner).single();
    expect(member!.role).toBe("org_owner");
    expect((await flags(id)).claimed_at).not.toBeNull();
    expect(await actions(id)).toContain("business.claimed");

    // Once only: not again by the same person, not by anyone else, and no fresh link.
    expect(await claimLinkInfo(token)).toMatchObject({ state: "used" });
    await expect(claimBusiness(token, founder)).rejects.toThrow("ALREADY_USED");
    await expect(createClaimLink(id, founder)).rejects.toThrow("ALREADY_CLAIMED");
  });

  it("refuses an expired claim link", async () => {
    const id = await business("Expired", { priced: false, ownerUserId: null, createdByAdmin: true });
    const { token } = await createClaimLink(id, founder);
    await admin.from("organization_claim_links").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("organization_id", id);
    expect(await claimLinkInfo(token)).toMatchObject({ state: "expired" });
    await expect(claimBusiness(token, owner)).rejects.toThrow("EXPIRED");
    expect((await flags(id)).claimed_at).toBeNull();
  });
});

describe("a draft business from a get listed request", () => {
  it("creates one draft, prefilled, and never a second", async () => {
    const application = await createApplication({ organizationName: `TEST delete ${TAG} Applicant`, contactPerson: "TEST delete Owner", section: "entertainment", whatsappE164: "+12425550188", instagramHandle: `test_applicant_${TAG}`, note: null, utmSource: null, utmMedium: null, utmCampaign: null, planCode: null });
    const draft = await draftBusinessFromApplication(application.id, founder);
    made.push(draft.id);
    expect(draft).toMatchObject({ status: "draft", createdByAdmin: true, primaryCategory: "entertainment", whatsappE164: "+12425550188", instagramHandle: `test_applicant_${TAG}`, isPublished: false });
    const { data: row } = await admin.from("applications").select("status").eq("id", application.id).single();
    expect(row!.status).toBe("approved");
    const { data: linked } = await admin.from("organizations").select("application_id").eq("id", draft.id).single();
    expect(Number(linked!.application_id)).toBe(application.id);
    await expect(draftBusinessFromApplication(application.id, founder)).rejects.toThrow("ALREADY_REVIEWED");
    expect((await getBusiness(draft.id))?.status).toBe("draft");
  });
});
