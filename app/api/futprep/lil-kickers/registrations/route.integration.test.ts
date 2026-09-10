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
    consentAccepted: true,
    signatureName: "Test Parent",
    ...overrides,
  };
}

function post(payload: Record<string, unknown>) {
  return POST(
    new Request("https://portpass.test/api/futprep/lil-kickers/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

describe("POST /api/futprep/lil-kickers/registrations", () => {
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
    expect(body.referenceCode).toMatch(/^FP-/);
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
