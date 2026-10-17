import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (A1): the registration save route, with the staff session and
// the database replaced by fakes. An admin login without the medical
// switch never changes a child's health fields or internal notes, even if
// the request carries them.
const auth = vi.hoisted(() => ({ role: "admin" as string | null, medical: false }));
const saved = vi.hoisted(() => ({ bodies: [] as Array<Record<string, unknown>> }));

vi.mock("@/app/futprep/staff-auth", () => ({
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  currentFutprepStaffName: vi.fn(async () => "TEST Desk"),
  currentFutprepStaffCanViewMedical: vi.fn(async () => auth.medical),
}));
vi.mock("@/db/staff", () => ({
  updateFutprepRegistrationDetail: vi.fn(async (_id: number, body: Record<string, unknown>) => {
    saved.bodies.push(body);
  }),
}));

import { PUT } from "./route";

const BODY = { childName: "TEST Child", parentPhone: "2425550101", allergies: "TEST overwrite", medicalConditions: "", medications: "", specialNeeds: "", additionalNotes: "" };
const put = () => PUT(new Request("http://localhost/api/futprep/staff/registrations/7/detail", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) }), { params: Promise.resolve({ id: "7" }) });

beforeEach(() => {
  auth.role = "admin";
  auth.medical = false;
  saved.bodies = [];
});

describe("saving a registration: the emergency contact and pickup (brief 34)", () => {
  const withEmergency = { childName: "TEST Child", emergencyContactName: "", emergencyContactPhone: "", authorizedPickup: "" };
  const putEmergency = () => PUT(new Request("http://localhost/api/futprep/staff/registrations/7/detail", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withEmergency) }), { params: Promise.resolve({ id: "7" }) });

  it("drops them for an admin without the medical switch, so a hidden field is never saved blank", async () => {
    expect((await putEmergency()).status).toBe(200);
    expect(saved.bodies).toEqual([{ childName: "TEST Child" }]);
  });

  it("keeps them for a login with the medical view", async () => {
    auth.medical = true;
    expect((await putEmergency()).status).toBe(200);
    expect(saved.bodies[0]).toEqual(withEmergency);
  });
});

describe("saving a registration (brief 31, A1)", () => {
  it("drops the health fields for an admin without the medical switch", async () => {
    expect((await put()).status).toBe(200);
    expect(saved.bodies).toEqual([{ childName: "TEST Child", parentPhone: "2425550101" }]);
  });

  it("keeps them for a login that may see them", async () => {
    auth.medical = true;
    expect((await put()).status).toBe(200);
    expect(saved.bodies[0]).toMatchObject({ allergies: "TEST overwrite", additionalNotes: "" });
  });

  it("still refuses a coach outright", async () => {
    auth.role = "coach";
    expect((await put()).status).toBe(403);
    expect(saved.bodies).toEqual([]);
  });
});
