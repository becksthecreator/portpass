import { describe, expect, it } from "vitest";
import { POST } from "./route";

// Requires SUPABASE_URL/SUPABASE_SECRET_KEY pointed at the seeded local
// Supabase stack started in .github/workflows/ci.yml - see
// scripts/seed-test-data.ts for the fixture (organization "futprep" with
// programs lil-kickers/full-test-program/inactive-test-program).
function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    parentName: "Test Parent",
    parentEmail: `parent-${crypto.randomUUID()}@test.portpass.local`,
    parentPhone: "242-000-0000",
    relationship: "Mother",
    childName: `Test Child ${crypto.randomUUID().slice(0, 8)}`,
    childDob: "2022-01-01",
    gender: "Female",
    emergencyContactName: "Emergency Contact",
    emergencyContactPhone: "242-000-0001",
    authorizedPickup: "Test Parent",
    programSlug: "lil-kickers",
    paymentFrequency: "weekly",
    paymentMethod: "cash",
    photoConsent: "yes",
    heardAboutUs: "instagram",
    consentAccepted: true,
    signatureName: "Test Parent",
    ...overrides,
  };
}

// Each call comes from its own address: the route allows 30 per address
// per ten minutes, and this file makes more than that in one process.
let ip = 0;
function post(payload: Record<string, unknown>) {
  ip += 1;
  return POST(
    new Request("https://portpass.test/api/futprep/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.27.${Math.floor(ip / 250)}.${ip % 250}` },
      body: JSON.stringify(payload),
    }),
  );
}

describe("POST /api/futprep/registrations", () => {
  it("registers successfully on the happy path", async () => {
    const response = await post(basePayload());
    expect(response.status).toBe(201);
    const body = (await response.json()) as { registration?: { referenceCode?: string; amountDueCents?: number } };
    expect(body.registration?.referenceCode).toMatch(/^FP-/);
    expect(body.registration?.amountDueCents).toBe(3500);
  });

  it("rejects a second registration for the same child in the same term as a duplicate", async () => {
    const payload = basePayload();
    const first = await post(payload);
    expect(first.status).toBe(201);

    const second = await post(payload);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: string; referenceCode?: string };
    expect(body.error).toMatch(/already been received/i);
    // The existing code is never handed back: knowing a parent's email and a
    // child's name and birthday must not be enough to collect it.
    expect(body.referenceCode).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/FP-[0-9]{4}-/);
  });

  it("rejects a registration once the program is at capacity", async () => {
    const first = await post(basePayload({ programSlug: "full-test-program" }));
    expect(first.status).toBe(201);

    const second = await post(basePayload({ programSlug: "full-test-program" }));
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: string };
    expect(body.error).toMatch(/capacity/i);
  });

  it("rejects a child outside the program's age range", async () => {
    const response = await post(basePayload({ childDob: "2010-01-01" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/age/i);
  });

  it("rejects an unknown program slug", async () => {
    const response = await post(basePayload({ programSlug: "does-not-exist" }));
    expect(response.status).toBe(400);
  });

  it("rejects a registration against an inactive program", async () => {
    const response = await post(basePayload({ programSlug: "inactive-test-program" }));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid payment method", async () => {
    const response = await post(basePayload({ paymentMethod: "cheque" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/cash|bank transfer|online banking/i);
  });
});

// Booking in three taps (brief 27, C): the same route, mode "quick". The
// seeded Lil Kickers class is for ages 3 to 7 with a term through 2026.
function quickPayload(overrides: Record<string, unknown> = {}) {
  return {
    mode: "quick",
    parentName: "Test Parent",
    parentPhone: "242-555-0123",
    parentEmail: "",
    childName: `Test Quick ${crypto.randomUUID().slice(0, 8)}`,
    childAgeMonths: 60,
    healthNotes: "",
    programSlug: "lil-kickers",
    paymentFrequency: "weekly",
    paymentMethod: "cash",
    photoConsent: "no",
    consentAccepted: true,
    utmSource: "instagram",
    utmMedium: "bio",
    ...overrides,
  };
}

describe("POST /api/futprep/registrations, mode quick (brief 27, C)", () => {
  it("registers with a name, a phone and an age, no email and no account", async () => {
    const response = await post(quickPayload());
    expect(response.status).toBe(201);
    const body = (await response.json()) as { registration?: { referenceCode?: string; amountDueCents?: number; registrationStatus?: string } };
    expect(body.registration?.referenceCode).toMatch(/^FP-/);
    expect(body.registration?.amountDueCents).toBe(3500);
    expect(body.registration?.registrationStatus).toBe("pending");
  });

  it("takes an email when one is given, and refuses a broken one", async () => {
    expect((await post(quickPayload({ parentEmail: `quick-${crypto.randomUUID()}@test.portpass.local` }))).status).toBe(201);
    const bad = await post(quickPayload({ parentEmail: "not-an-email" }));
    expect(bad.status).toBe(400);
  });

  it("keeps the age rule: a ten-year-old can't join Lil Kickers", async () => {
    const response = await post(quickPayload({ childAgeMonths: 120 }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error?: string }).error).toMatch(/age/i);
    expect((await post(quickPayload({ childAgeMonths: "soon" }))).status).toBe(400);
  });

  it("still needs the consent, the photo answer, a phone and a way to pay", async () => {
    expect((await post(quickPayload({ consentAccepted: false }))).status).toBe(400);
    expect((await post(quickPayload({ photoConsent: "" }))).status).toBe(400);
    expect((await post(quickPayload({ parentPhone: "" }))).status).toBe(400);
    expect((await post(quickPayload({ paymentMethod: "card" }))).status).toBe(400);
  });

  it("treats a second email-less entry for the same child from the same phone as a duplicate, and another family's same-named child as new", async () => {
    const payload = quickPayload();
    expect((await post(payload)).status).toBe(201);
    expect((await post(payload)).status).toBe(409);
    expect((await post({ ...payload, parentPhone: "242-555-0177" })).status).toBe(201);
  });
});
