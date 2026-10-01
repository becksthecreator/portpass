import { beforeEach, describe, expect, it, vi } from "vitest";

// Staff accounts route, with the staff session and the database replaced by
// fakes. The CEO login opens coach pay, which is for Alex and platform
// owners only, so the registration desk (admin) must not be able to make
// itself a CEO login or switch Alex's off.
const auth = vi.hoisted(() => ({ role: null as string | null }));
const db = vi.hoisted(() => ({
  accounts: [
    { id: 1, name: "TEST Alex", accountKey: "test-ceo", role: "ceo", active: true, pinChangedAt: null },
    { id: 2, name: "TEST Desk", accountKey: "test-desk", role: "admin", active: true, pinChangedAt: null },
    { id: 3, name: "TEST Coach", accountKey: "test-coach", role: "coach", active: true, pinChangedAt: null },
  ],
  created: [] as Array<{ role: string }>,
  toggled: [] as Array<{ id: number; active: boolean }>,
  emails: [] as Array<{ id: number; email: string | null }>,
}));

vi.mock("@/app/futprep/staff-auth", () => ({
  FUTPREP_STAFF_ROLES: ["admin", "coach", "ceo", "helper"],
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  canManageFutprepTeam: (role: string) => role === "admin" || role === "ceo",
  listStaffAccounts: vi.fn(async () => db.accounts),
  createStaffAccount: vi.fn(async (input: { role: string }) => {
    db.created.push({ role: input.role });
    return { id: 9, ...input };
  }),
  setStaffAccountActive: vi.fn(async (id: number, active: boolean) => {
    db.toggled.push({ id, active });
  }),
  setStaffAccountEmail: vi.fn(async (id: number, email: string | null) => {
    db.emails.push({ id, email });
  }),
}));

import { PATCH, POST } from "./route";

function send(method: "POST" | "PATCH", body: unknown) {
  return new Request("http://localhost/api/futprep/staff/accounts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const NEW = { name: "TEST New", accountKey: "test-new", pin: "000000" };

beforeEach(() => {
  auth.role = null;
  db.created = [];
  db.toggled = [];
  db.emails = [];
});

describe("creating a staff login", () => {
  it("refuses anyone who is not the registration desk or the CEO", async () => {
    expect((await POST(send("POST", { ...NEW, role: "coach" }))).status).toBe(401);
    auth.role = "coach";
    expect((await POST(send("POST", { ...NEW, role: "coach" }))).status).toBe(401);
    expect(db.created).toEqual([]);
  });

  it("lets the registration desk create every role except CEO", async () => {
    auth.role = "admin";
    for (const role of ["admin", "coach", "helper"]) expect((await POST(send("POST", { ...NEW, role }))).status).toBe(201);
    const refused = await POST(send("POST", { ...NEW, role: "ceo" }));
    expect(refused.status).toBe(403);
    expect(db.created.map((c) => c.role)).toEqual(["admin", "coach", "helper"]);
  });

  it("lets the CEO create a CEO login", async () => {
    auth.role = "ceo";
    expect((await POST(send("POST", { ...NEW, role: "ceo" }))).status).toBe(201);
    expect(db.created).toEqual([{ role: "ceo" }]);
  });
});

describe("the email address reminders go to", () => {
  it("saves a tidy address, clears it when left empty, and refuses one that isn't an address", async () => {
    auth.role = "admin";
    expect((await PATCH(send("PATCH", { id: 3, email: "  TEST-Coach@test.portpass.local " }))).status).toBe(200);
    expect((await PATCH(send("PATCH", { id: 3, email: "" }))).status).toBe(200);
    expect((await PATCH(send("PATCH", { id: 3, email: "not an address" }))).status).toBe(400);
    expect(db.emails).toEqual([{ id: 3, email: "test-coach@test.portpass.local" }, { id: 3, email: null }]);
    expect(db.toggled).toEqual([]);
  });

  it("lets only the CEO change the CEO login's address (the monthly report goes there)", async () => {
    auth.role = "admin";
    expect((await PATCH(send("PATCH", { id: 1, email: "test-someone@test.portpass.local" }))).status).toBe(403);
    auth.role = "ceo";
    expect((await PATCH(send("PATCH", { id: 1, email: "test-alex@test.portpass.local" }))).status).toBe(200);
    expect(db.emails).toEqual([{ id: 1, email: "test-alex@test.portpass.local" }]);
  });
});

describe("switching a staff login off or on", () => {
  it("stops the registration desk switching a CEO login off or on", async () => {
    auth.role = "admin";
    expect((await PATCH(send("PATCH", { id: 1, active: false }))).status).toBe(403);
    expect((await PATCH(send("PATCH", { id: 1, active: true }))).status).toBe(403);
    expect((await PATCH(send("PATCH", { id: 3, active: false }))).status).toBe(200);
    expect(db.toggled).toEqual([{ id: 3, active: false }]);
  });

  it("lets the CEO change any login, and answers 404 for one that isn't there", async () => {
    auth.role = "ceo";
    expect((await PATCH(send("PATCH", { id: 1, active: false }))).status).toBe(200);
    expect((await PATCH(send("PATCH", { id: 77, active: false }))).status).toBe(404);
    expect(db.toggled).toEqual([{ id: 1, active: false }]);
  });
});
