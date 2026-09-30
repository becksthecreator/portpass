import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { createFutprepRegistration, type FutprepRegistrationInput } from "./registrations";

// Growth tracking (28 Sept brief), the acceptance list, against the local
// Supabase stack started by CI. Every row is "TEST — delete" and removed
// afterwards; nothing here sends an email (that happens in the route, not
// in db/registrations).
const MARKER = `TEST — delete ${crypto.randomUUID().slice(0, 8)}`;
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

function newPhone() {
  return `+12425${Math.floor(100000 + Math.random() * 899999)}`;
}
function newEmail() {
  return `test-delete-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

function input(over: Partial<FutprepRegistrationInput> & Pick<FutprepRegistrationInput, "parentPhone" | "parentEmail">): FutprepRegistrationInput {
  return {
    parentName: MARKER,
    relationship: "Mother",
    childName: `${MARKER} child ${crypto.randomUUID().slice(0, 4)}`,
    childDob: "2024-03-01", // 30 months on 5 Sept 2026: Lil Kickers (18–47 months)
    gender: "Female",
    emergencyContactName: MARKER,
    emergencyContactPhone: "+12425550199",
    allergies: "none",
    medicalConditions: "",
    medications: "",
    specialNeeds: "",
    authorizedPickup: MARKER,
    additionalNotes: "TEST — delete",
    programSlug: "lil-kickers",
    paymentFrequency: "weekly",
    paymentMethod: "cash",
    photoConsent: "no",
    consentAccepted: true,
    signatureName: MARKER,
    ...over,
  };
}

async function stored(referenceCode: string) {
  const { data, error } = await db()
    .from("registrations")
    .select("source_channel,is_new_family,commission_eligible,commission_reason,utm_source,utm_medium,utm_campaign,referrer_host,heard_about_us,referral_code")
    .eq("reference_code", referenceCode)
    .single();
  expect(error).toBeNull();
  return data!;
}

afterAll(async () => {
  await db().from("registrations").delete().eq("parent_name", MARKER);
});

const QR = { ...EMPTY_ATTRIBUTION, utmSource: "portpass", utmMedium: "qr", utmCampaign: "term2_field_banner" };

describe("Futprep registration attribution (handbook v1.3 §5)", () => {
  const phone = newPhone();
  const email = newEmail();

  it("a new family from ?utm_source=portpass&utm_medium=qr is new, eligible, reason 'PortPass QR'", async () => {
    const { referenceCode } = await createFutprepRegistration(input({ parentPhone: phone, parentEmail: email, heardAboutUs: "qr", attribution: QR }));
    expect(await stored(referenceCode)).toMatchObject({
      source_channel: "qr",
      is_new_family: true,
      commission_eligible: true,
      commission_reason: "PortPass QR",
      utm_source: "portpass",
      utm_medium: "qr",
      utm_campaign: "term2_field_banner",
      heard_about_us: "qr",
    });
  });

  it("the same phone registering a sibling is not new and not eligible", async () => {
    const { referenceCode } = await createFutprepRegistration(input({ parentPhone: phone, parentEmail: newEmail(), childDob: "2024-06-01", heardAboutUs: "referral", referralCode: "my sister", attribution: QR }));
    const row = await stored(referenceCode);
    expect(row.is_new_family).toBe(false);
    expect(row.commission_eligible).toBe(false);
    expect(row.commission_reason).toMatch(/^Returning family/);
  });

  it("the same email (new phone) is also a returning family", async () => {
    const { referenceCode } = await createFutprepRegistration(input({ parentPhone: newPhone(), parentEmail: email, childDob: "2024-08-01", heardAboutUs: "qr", attribution: QR }));
    expect((await stored(referenceCode)).is_new_family).toBe(false);
  });

  it("'Instagram' with no PortPass link is recorded but not eligible", async () => {
    const { referenceCode } = await createFutprepRegistration(input({ parentPhone: newPhone(), parentEmail: newEmail(), heardAboutUs: "instagram", attribution: { ...EMPTY_ATTRIBUTION, referrerHost: "instagram.com" } }));
    expect(await stored(referenceCode)).toMatchObject({
      source_channel: "instagram",
      is_new_family: true,
      commission_eligible: false,
      commission_reason: "Self-reported Instagram, no PortPass link",
      referrer_host: "instagram.com",
    });
  });

  it("a staff-entered registration is never commissionable, whatever the link said", async () => {
    const { referenceCode } = await createFutprepRegistration(input({ parentPhone: newPhone(), parentEmail: newEmail(), heardAboutUs: "qr", attribution: QR, enteredByStaff: "Coach Test" }));
    expect(await stored(referenceCode)).toMatchObject({ commission_eligible: false, commission_reason: "Entered by staff" });
  });
});
