import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as futprepPost } from "@/app/api/futprep/registrations/route";
import { listAccountBookings } from "@/db/accountBookings";
import { getRegistrationBusiness } from "@/db/registrationBusiness";
import { listFutprepOffers } from "@/db/registrations";
import { sendEmail } from "@/lib/email";
import { POST } from "./route";

// Registration for any business (brief 18, part D) against CI's local
// Supabase stack: a TEST business with one children's programme and one
// adults' programme registers end to end, an adult's registration holds no
// health, emergency or guardian detail, and Futprep's own flow is as it
// was. No email leaves: sendEmail is replaced, and every address is on the
// reserved test domain anyway. Every row is "TEST — delete" and removed.
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email")>()), sendEmail: vi.fn(async () => "sent" as const) }));

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const SLUG = `test-delete-reg-${TAG}`;
const HIDDEN_SLUG = `test-delete-reg-hidden-${TAG}`;
const KIDS = `test-delete-kids-${TAG}`;
const ADULTS = `test-delete-adults-${TAG}`;
const MIXED = `test-delete-mixed-${TAG}`;
const SMALL = `test-delete-small-${TAG}`;
let orgId = 0;
let hiddenOrgId = 0;
let ip = 0;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function post(payload: Record<string, unknown>) {
  ip += 1;
  return POST(new Request("https://portpass.test/api/registrations", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.18.0.${ip}` }, body: JSON.stringify(payload) }));
}

const adultPayload = (over: Record<string, unknown> = {}) => ({
  organizationSlug: SLUG,
  programSlug: ADULTS,
  parentName: `TEST delete Adult ${crypto.randomUUID().slice(0, 6)}`,
  parentEmail: `adult-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`,
  parentPhone: "242-555-0144",
  paymentFrequency: "term",
  paymentMethod: "cash",
  photoConsent: "no",
  heardAboutUs: "instagram",
  consentAccepted: true,
  signatureName: "TEST delete Adult",
  ...over,
});

const childPayload = (over: Record<string, unknown> = {}) => ({
  ...adultPayload({ programSlug: KIDS, parentName: "TEST delete Parent", signatureName: "TEST delete Parent", paymentFrequency: "weekly", paymentMethod: "bank_transfer" }),
  relationship: "Mother",
  childName: `Amara TEST delete ${crypto.randomUUID().slice(0, 6)}`,
  childDob: day(-365 * 6),
  gender: "Female",
  emergencyContactName: "TEST delete Emergency",
  emergencyContactPhone: "242-555-0145",
  authorizedPickup: "TEST delete Parent",
  allergies: `ZZPEANUT${TAG}`,
  medicalConditions: `ZZASTHMA${TAG}`,
  ...over,
});

const row = async (reference: string) => (await db.from("registrations").select("*").eq("reference_code", reference).single()).data!;

beforeAll(async () => {
  const business = (extra: Record<string, unknown>) => ({ primary_category: "entertainment", status: "approved", one_liner: "TEST — delete.", brand_color: "#E4FB3E", payment_methods: ["cash"], ...extra });
  const { data: orgs, error } = await db
    .from("organizations")
    .insert([business({ name: `TEST delete ${TAG} Studio`, slug: SLUG }), business({ name: `TEST delete ${TAG} Hidden`, slug: HIDDEN_SLUG })])
    .select("id,slug");
  if (error || !orgs) throw new Error(`Could not seed the TEST businesses: ${error?.message}`);
  orgId = Number(orgs.find((o) => o.slug === SLUG)!.id);
  hiddenOrgId = Number(orgs.find((o) => o.slug === HIDDEN_SLUG)!.id);
  // Only the first goes public (a page needs a priced offering to publish).
  const offering = await db.from("offerings").insert({ organization_id: orgId, type: "service", slug: `test-${TAG}`, name: "TEST class", price_cents: 2500, is_published: true });
  if (offering.error) throw new Error(offering.error.message);
  const live = await db.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", orgId);
  if (live.error) throw new Error(live.error.message);
  const settings = await db.from("organization_payment_settings").insert({ organization_id: orgId, reference_prefix: "TDS", accepted_methods: ["cash", "bank_transfer"], bank_name: "TEST Bank", account_name: "TEST Studio", account_number_last4: "0042", transfer_instructions: `TEST full account ZZACCOUNT${TAG}` });
  if (settings.error) throw new Error(settings.error.message);

  const program = (slug: string, audience: string, extra: Record<string, unknown> = {}) => ({ organization_id: orgId, slug, name: `TEST delete ${audience} class`, program_type: "term", audience, is_public: true, age_min: 4, age_max: 10, coed: true, location: "TEST studio", day_of_week: "Saturday", start_time: "10:00 AM", end_time: "11:00 AM", capacity: 12, active: true, ...extra });
  const { data: programs, error: programError } = await db
    .from("programs")
    .insert([program(KIDS, "children"), program(ADULTS, "adults", { age_min: 18, age_max: 99 }), program(MIXED, "mixed", { age_min: 10, age_max: 99 }), program(SMALL, "adults", { capacity: 1, age_min: 18, age_max: 99 }), { ...program(`test-delete-hidden-${TAG}`, "adults"), organization_id: hiddenOrgId }])
    .select("id");
  if (programError || !programs) throw new Error(`Could not seed the TEST programmes: ${programError?.message}`);
  const terms = await db.from("program_terms").insert(programs.map((p) => ({ program_id: p.id, name: "TEST term", start_date: day(-7), end_date: day(49), weekly_fee_cents: 2500, term_fee_cents: 18000, active: true })));
  if (terms.error) throw new Error(terms.error.message);
});

afterAll(async () => {
  for (const id of [orgId, hiddenOrgId].filter(Boolean)) {
    const { data: programs } = await db.from("programs").select("id").eq("organization_id", id);
    const ids = (programs ?? []).map((p) => p.id);
    if (ids.length) {
      await db.from("registrations").delete().in("program_id", ids);
      await db.from("sessions").delete().in("program_id", ids);
      await db.from("program_terms").delete().in("program_id", ids);
      await db.from("programs").delete().in("id", ids);
    }
    await db.from("audit_log").delete().eq("organization_id", id);
    await db.from("organizations").delete().eq("id", id);
  }
});

describe("registration for any business", () => {
  it("lists the business's own open programmes, each with who it is for", async () => {
    const business = (await getRegistrationBusiness(SLUG))!;
    expect(business).toMatchObject({ id: orgId, methods: ["bank_transfer", "cash"], bank: { bankName: "TEST Bank", accountName: "TEST Studio", last4: "0042" } });
    // The business's own transfer instructions never travel with the form.
    expect(JSON.stringify(business)).not.toContain(`ZZACCOUNT${TAG}`);
    const offers = await listFutprepOffers({ publicOnly: true, organizationId: orgId });
    expect(offers.map((o) => [o.slug, o.audience]).sort()).toEqual([[ADULTS, "adults"], [KIDS, "children"], [MIXED, "mixed"], [SMALL, "adults"]].sort());
    // Futprep's list is its own.
    expect((await listFutprepOffers({ publicOnly: true })).some((o) => o.slug === KIDS)).toBe(false);
  });

  it("registers a child end to end, with the health details a children's programme asks for", async () => {
    vi.mocked(sendEmail).mockClear();
    const payload = childPayload();
    const response = await post(payload);
    expect(response.status).toBe(201);
    const { registration } = (await response.json()) as { registration: { referenceCode: string; amountDueCents: number; registrationStatus: string } };
    expect(registration.referenceCode).toMatch(/^PP-\d{4}-[A-Z0-9]{8}$/);
    expect(registration).toMatchObject({ amountDueCents: 2500, registrationStatus: "pending" });
    const saved = await row(registration.referenceCode);
    expect(saved).toMatchObject({ organization_id: orgId, participant_is_adult: false, relationship: "Mother", allergies: `ZZPEANUT${TAG}`, payment_method: "bank_transfer", consent_version: "portpass-registration-child-v1", gender: "Female" });

    // The email is from the business, names the child by first name only,
    // and carries no health or emergency detail.
    const sent = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sent.to).toBe(payload.parentEmail);
    expect(sent.subject).toContain("registration received for Amara");
    expect(sent.html).not.toContain("ZZPEANUT");
    expect(sent.html).not.toContain("ZZASTHMA");
    expect(sent.html).not.toContain("TEST delete Emergency");
    expect(sent.html).not.toContain(payload.childName);

    // It shows on the parent's account, first name only.
    const mine = await listAccountBookings(payload.parentEmail);
    expect(mine.registrations).toHaveLength(1);
    expect(mine.registrations[0]).toMatchObject({ childFirstName: "Amara", reference: registration.referenceCode });
  });

  it("asks a parent for the child's details, and checks the child's age against the class", async () => {
    expect((await post(childPayload({ emergencyContactName: "" }))).status).toBe(400);
    expect((await post(childPayload({ childDob: "" }))).status).toBe(400);
    const tooOld = await post(childPayload({ childDob: day(-365 * 15) }));
    expect(tooOld.status).toBe(400);
    expect(((await tooOld.json()) as { error: string }).error).toMatch(/age/);
  });

  it("registers an adult with no guardian, emergency or health detail, even if some are sent", async () => {
    const payload = adultPayload({ allergies: `ZZPEANUT${TAG}`, medicalConditions: `ZZASTHMA${TAG}`, emergencyContactName: "ZZEMERGENCY", authorizedPickup: "ZZPICKUP", childDob: "1990-01-01", gender: "Male", childName: "ZZSOMEONEELSE" });
    const response = await post(payload);
    expect(response.status).toBe(201);
    const { registration } = (await response.json()) as { registration: { referenceCode: string; amountDueCents: number } };
    expect(registration.amountDueCents).toBe(18000);
    const saved = await row(registration.referenceCode);
    expect(saved).toMatchObject({ participant_is_adult: true, child_name: payload.parentName, relationship: "Self", child_dob: null, gender: null, emergency_contact_name: null, emergency_contact_phone: null, allergies: null, medical_conditions: null, medications: null, special_needs: null, authorized_pickup: null, consent_version: "portpass-registration-adult-v1" });
    expect(JSON.stringify(saved)).not.toMatch(/ZZPEANUT|ZZASTHMA|ZZEMERGENCY|ZZPICKUP|ZZSOMEONEELSE|1990-01-01/);

    // The same adult can't register twice for the same term.
    const again = await post(payload);
    expect(again.status).toBe(409);
    expect(JSON.stringify(await again.json())).not.toMatch(/PP-\d{4}-/);
  });

  it("lets the registrant on a mixed programme say whether they are the adult or it is for a child", async () => {
    const asAdult = await post(adultPayload({ programSlug: MIXED, participantIsAdult: true }));
    expect(asAdult.status).toBe(201);
    expect(await row(((await asAdult.json()) as { registration: { referenceCode: string } }).registration.referenceCode)).toMatchObject({ participant_is_adult: true, allergies: null });
    // Without that answer it is a child's registration, and asks for the child's details.
    expect((await post(adultPayload({ programSlug: MIXED }))).status).toBe(400);
    const forChild = await post(childPayload({ programSlug: MIXED, childDob: day(-365 * 12) }));
    expect(forChild.status).toBe(201);
    expect(await row(((await forChild.json()) as { registration: { referenceCode: string } }).registration.referenceCode)).toMatchObject({ participant_is_adult: false, relationship: "Mother" });
    // Saying "adult" on a children's programme changes nothing.
    expect((await post(adultPayload({ programSlug: KIDS, participantIsAdult: true }))).status).toBe(400);
  });

  it("keeps the same caps and waitlist as Futprep's form", async () => {
    expect((await post(adultPayload({ programSlug: SMALL }))).status).toBe(201);
    const full = await post(adultPayload({ programSlug: SMALL }));
    expect(full.status).toBe(409);
    const waitlist = await post(adultPayload({ programSlug: SMALL, mode: "waitlist" }));
    expect(waitlist.status).toBe(201);
    expect(((await waitlist.json()) as { registration: { registrationStatus: string } }).registration.registrationStatus).toBe("waitlist");
  });

  it("only takes a registration for a public business's own programme, with a method it accepts", async () => {
    // A business that isn't public takes none.
    expect((await post(adultPayload({ organizationSlug: HIDDEN_SLUG, programSlug: `test-delete-hidden-${TAG}` }))).status).toBe(404);
    // Another business's programme can't be reached through this one.
    expect((await post(adultPayload({ programSlug: "lil-kickers" }))).status).toBe(400);
    expect((await post(adultPayload({ organizationSlug: "no-such-business" }))).status).toBe(404);
    // Futprep registers through its own form.
    expect((await post(childPayload({ organizationSlug: "futprep", programSlug: "lil-kickers" }))).status).toBe(400);
    // Only what the business chose in Get paid; never a card.
    expect((await post(adultPayload({ paymentMethod: "card" }))).status).toBe(400);
    expect((await post(adultPayload({ paymentMethod: "online_banking" }))).status).toBe(400);
    expect((await post(adultPayload({ consentAccepted: false }))).status).toBe(400);
    expect((await post(adultPayload({ heardAboutUs: "" }))).status).toBe(400);
  });
});

describe("Futprep, unchanged", () => {
  it("still registers a child through its own endpoint, with an FP- reference and its own consent version", async () => {
    const response = await futprepPost(
      new Request("https://portpass.test/api/futprep/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.18.1.1" },
        body: JSON.stringify({
          parentName: "TEST delete Parent", parentEmail: `fp-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`, parentPhone: "242-555-0146", relationship: "Mother",
          childName: `TEST delete Child ${crypto.randomUUID().slice(0, 6)}`, childDob: "2022-01-01", gender: "Female",
          emergencyContactName: "TEST delete Emergency", emergencyContactPhone: "242-555-0147", authorizedPickup: "TEST delete Parent", allergies: "TEST none",
          programSlug: "lil-kickers", paymentFrequency: "weekly", paymentMethod: "cash", photoConsent: "yes", heardAboutUs: "instagram", consentAccepted: true, signatureName: "TEST delete Parent",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const { registration } = (await response.json()) as { registration: { referenceCode: string; amountDueCents: number } };
    expect(registration.referenceCode).toMatch(/^FP-\d{4}-[A-Z0-9]{8}$/);
    expect(registration.amountDueCents).toBe(3500);
    const saved = await row(registration.referenceCode);
    expect(saved).toMatchObject({ participant_is_adult: false, allergies: "TEST none", gender: "Female", relationship: "Mother", consent_version: "futprep-lil-kickers-term1-v1" });
    await db.from("registrations").delete().eq("reference_code", registration.referenceCode);
  });
});
