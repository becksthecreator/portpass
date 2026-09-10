import { describe, expect, it } from "vitest";
import { POST as registerPOST } from "../../lil-kickers/registrations/route";
import { POST as lookupPOST } from "./route";

const SENSITIVE_MARKER = "PEANUT_ALLERGY_MARKER_DO_NOT_LEAK";

async function registerChild() {
  const childDob = "2022-01-01";
  const response = await registerPOST(
    new Request("https://portpass.test/api/futprep/lil-kickers/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentName: "Lookup Test Parent",
        parentEmail: `parent-${crypto.randomUUID()}@test.portpass.local`,
        parentPhone: "242-000-0000",
        relationship: "Mother",
        childName: `Lookup Test Child ${crypto.randomUUID().slice(0, 8)}`,
        childDob,
        gender: "Female",
        emergencyContactName: "Emergency Contact",
        emergencyContactPhone: "242-000-0001",
        authorizedPickup: "Lookup Test Parent",
        allergies: SENSITIVE_MARKER,
        medicalConditions: SENSITIVE_MARKER,
        medications: SENSITIVE_MARKER,
        specialNeeds: SENSITIVE_MARKER,
        programSlug: "lil-kickers",
        paymentFrequency: "weekly",
        paymentMethod: "cash",
        photoConsent: "yes",
        consentAccepted: true,
        signatureName: "Lookup Test Parent",
      }),
    }),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { registration: { referenceCode: string } };
  return { referenceCode: body.registration.referenceCode, childDob };
}

function lookup(referenceCode: string, childDob: string, ip = "203.0.113.1") {
  return lookupPOST(
    new Request("https://portpass.test/api/futprep/registrations/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ referenceCode, childDob }),
    }),
  );
}

describe("POST /api/futprep/registrations/lookup", () => {
  it("succeeds with the correct code and date of birth", async () => {
    const { referenceCode, childDob } = await registerChild();
    const response = await lookup(referenceCode, childDob, "203.0.113.10");
    expect(response.status).toBe(200);
  });

  it("never returns medical, allergy, medication, special-needs or emergency-contact fields", async () => {
    const { referenceCode, childDob } = await registerChild();
    const response = await lookup(referenceCode, childDob, "203.0.113.11");
    expect(response.status).toBe(200);

    const raw = await response.text();
    expect(raw).not.toContain(SENSITIVE_MARKER);
    expect(raw).not.toContain("Emergency Contact");

    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed.status ?? {});
    for (const forbidden of ["allergies", "medicalConditions", "medications", "specialNeeds", "emergencyContactName", "emergencyContactPhone"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("fails with the wrong date of birth", async () => {
    const { referenceCode } = await registerChild();
    const response = await lookup(referenceCode, "1999-01-01", "203.0.113.12");
    expect(response.status).toBe(404);
  });

  it("rate-limits repeated attempts from the same IP", async () => {
    const { referenceCode, childDob } = await registerChild();
    const ip = "203.0.113.99";

    let lastStatus = 0;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await lookup(referenceCode, childDob, ip);
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
  });
});
