import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBusiness } from "./business";
import { getOrganizationLicences, markOrganizationLicencesVerified, setOrganizationLicences } from "./licences";
import { getOrganizationListingForPreview } from "./organizations";

// Licence fields (round 5, §7) exist for a later verification process and
// are admin-only: they round-trip through db/licences.ts and appear in no
// public or owner shape.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const slug = `test-delete-licence-${Date.now()}`;
let orgId = 0;
let userId = "";

beforeAll(async () => {
  const { data, error } = await admin.from("organizations").insert({ name: "TEST — delete Permit Co", slug, primary_category: "services", subcategory: "phone-tech-repair", status: "approved" }).select("id").single();
  expect(error).toBeNull();
  orgId = Number(data!.id);
  const { data: user, error: userError } = await admin.auth.admin.createUser({ email: `test-delete-licence-${Date.now()}@example.com`, email_confirm: true });
  expect(userError).toBeNull();
  userId = user.user!.id;
});

afterAll(async () => {
  if (orgId) {
    await admin.from("audit_log").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("organization licences", () => {
  it("starts empty and unverified", async () => {
    expect(await getOrganizationLicences(orgId)).toEqual({ licences: [], verifiedAt: null, verifiedBy: null });
  });

  it("stores licences, and a change clears any verification", async () => {
    const saved = await setOrganizationLicences(orgId, [{ type: "Business licence", number: "BL-1234", expiresOn: "2027-12-31", documentUrl: null }], userId);
    expect(saved.licences).toEqual([{ type: "Business licence", number: "BL-1234", expiresOn: "2027-12-31", documentUrl: null }]);

    const verified = await markOrganizationLicencesVerified(orgId, userId);
    expect(verified.verifiedAt).not.toBeNull();
    expect(verified.verifiedBy).toBe(userId);

    const changed = await setOrganizationLicences(orgId, [{ type: "Business licence", number: "BL-9999", expiresOn: "2028-12-31", documentUrl: null }], userId);
    expect(changed.verifiedAt).toBeNull();
    expect(changed.verifiedBy).toBeNull();
  });

  it("rejects anything that isn't a JSON array at the database", async () => {
    const { error } = await admin.from("organizations").update({ licences: { type: "not a list" } }).eq("id", orgId);
    expect(error).not.toBeNull();
  });

  it("never appears in the public listing or the owner's business shape", async () => {
    const listing = await getOrganizationListingForPreview(orgId);
    expect(JSON.stringify(listing)).not.toMatch(/licen[cs]e/i);
    const business = await getBusiness(orgId);
    expect(JSON.stringify(business)).not.toMatch(/licen[cs]e/i);
  });
});
