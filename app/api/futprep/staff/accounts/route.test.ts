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
    { id: 4, name: "TEST Helper", accountKey: "test-helper", role: "helper", active: true, pinChangedAt: null, email: "test-helper@example.com" },
  ],
  revoked: [] as Array<{ staffId: number; reason: string }>,
  created: [] as Array<{ role: string }>,
  toggled: [] as Array<{ id: number; active: boolean }>,
  emails: [] as Array<{ id: number; email: string | null; actor: string }>,
  order: [] as string[],
  withoutLogin: [
    { id: 20, name: "TEST Quill", role: "coach", email: null },
    { id: 21, name: "TEST Old CEO row", role: "ceo", email: null },
  ],
  logins: [] as Array<{ id: number; role: string; actorName: string }>,
  medical: [] as Array<{ id: number; value: boolean; actorName: string }>,
}));

vi.mock("@/app/futprep/staff-auth", () => ({
  FUTPREP_STAFF_ROLES: ["admin", "coach", "ceo", "helper"],
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  currentFutprepStaffName: vi.fn(async () => (auth.role ? `TEST ${auth.role}` : null)),
  listStaffWithoutLogin: vi.fn(async () => db.withoutLogin),
  assignStaffLogin: vi.fn(async (input: { id: number; role: string; actorName: string }) => {
    db.logins.push({ id: input.id, role: input.role, actorName: input.actorName });
    return { ...input };
  }),
  setStaffCanViewMedical: vi.fn(async (id: number, value: boolean, actorName: string) => {
    db.medical.push({ id, value, actorName });
  }),
  canManageFutprepTeam: (role: string) => role === "admin" || role === "ceo",
  listStaffAccounts: vi.fn(async () => db.accounts),
  createStaffAccount: vi.fn(async (input: { role: string }) => {
    db.created.push({ role: input.role });
    return { id: 9, ...input };
  }),
  setStaffAccountActive: vi.fn(async (id: number, active: boolean) => {
    db.toggled.push({ id, active });
    db.order.push("switch");
  }),
}));

vi.mock("@/db/futprepOwner", () => ({
  revokeFutprepOwnerGrant: vi.fn(async (input: { staffId: number; reason: string }) => {
    db.revoked.push({ staffId: input.staffId, reason: input.reason });
    db.order.push("revoke");
    return true;
  }),
  // The real one changes the email and takes back any owner grant in one
  // database transaction (supabase/migrations/202610210002).
  setFutprepStaffEmail: vi.fn(async (input: { staffId: number; email: string | null; actor: string }) => {
    db.emails.push({ id: input.staffId, email: input.email, actor: input.actor });
    return true;
  }),
  futprepOwnerStaffState: vi.fn(async () => ({ staffId: 1, state: "waiting" })),
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
  db.logins = [];
  db.medical = [];
  db.revoked = [];
  db.order = [];
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
    expect(db.emails).toEqual([{ id: 3, email: "test-coach@test.portpass.local", actor: "TEST admin" }, { id: 3, email: null, actor: "TEST admin" }]);
    expect(db.toggled).toEqual([]);
  });

  it("lets only the CEO change the CEO login's address (the monthly report goes there)", async () => {
    auth.role = "admin";
    expect((await PATCH(send("PATCH", { id: 1, email: "test-someone@test.portpass.local" }))).status).toBe(403);
    auth.role = "ceo";
    expect((await PATCH(send("PATCH", { id: 1, email: "test-alex@test.portpass.local" }))).status).toBe(200);
    expect(db.emails).toEqual([{ id: 1, email: "test-alex@test.portpass.local", actor: "TEST ceo" }]);
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

describe("a login for someone already on the team (brief 31, A3)", () => {
  it("gives the existing row a login instead of making a second one", async () => {
    auth.role = "admin";
    const response = await POST(send("POST", { action: "login", id: 20, accountKey: "test-dre", role: "coach", pin: "000000" }));
    expect(response.status).toBe(201);
    expect(db.logins).toEqual([{ id: 20, role: "coach", actorName: "TEST admin" }]);
    expect(db.created).toEqual([]);
  });

  it("refuses a row that already has a login, and a CEO login from the desk", async () => {
    auth.role = "admin";
    expect((await POST(send("POST", { action: "login", id: 3, accountKey: "test-x", role: "coach", pin: "000000" }))).status).toBe(404);
    expect((await POST(send("POST", { action: "login", id: 21, accountKey: "test-y", role: "coach", pin: "000000" }))).status).toBe(403);
    expect((await POST(send("POST", { action: "login", id: 20, accountKey: "test-z", role: "ceo", pin: "000000" }))).status).toBe(403);
    expect(db.logins).toEqual([]);
  });

  it("refuses fields the route never reads", async () => {
    auth.role = "ceo";
    const response = await POST(send("POST", { ...NEW, role: "coach", pinHash: "x" }));
    expect(response.status).toBe(400);
    expect(db.created).toEqual([]);
  });
});

describe("the medical view of an admin or coach login (brief 31, A1)", () => {
  it("is switched by the CEO only, on admin and coach logins only", async () => {
    auth.role = "admin";
    expect((await PATCH(send("PATCH", { id: 2, canViewMedical: false }))).status).toBe(403);
    // An admin can't make a coach login and switch its health notes on.
    expect((await PATCH(send("PATCH", { id: 3, canViewMedical: true }))).status).toBe(403);
    auth.role = "ceo";
    expect((await PATCH(send("PATCH", { id: 4, canViewMedical: true }))).status).toBe(400);
    expect((await PATCH(send("PATCH", { id: 2, canViewMedical: false }))).status).toBe(200);
    expect((await PATCH(send("PATCH", { id: 3, canViewMedical: true }))).status).toBe(200);
    expect(db.medical).toEqual([{ id: 2, value: false, actorName: "TEST ceo" }, { id: 3, value: true, actorName: "TEST ceo" }]);
    expect(db.toggled).toEqual([]);
  });
});

describe("owner access follows the login (brief 31, A4 after review)", () => {
  it("is taken back straight after a login is switched off, and the screen gets the owner state", async () => {
    auth.role = "ceo";
    const response = await PATCH(send("PATCH", { id: 1, active: false }));
    expect(response.status).toBe(200);
    expect(db.order).toEqual(["switch", "revoke"]);
    expect(db.revoked).toEqual([{ staffId: 1, reason: "login_switched_off" }]);
    expect(await response.json()).toMatchObject({ ownerStates: { 1: "waiting" } });
  });

  it("an email change goes through the one function that also takes the grant back", async () => {
    auth.role = "admin";
    expect((await PATCH(send("PATCH", { id: 4, email: "TEST-Other@example.com " }))).status).toBe(200);
    expect(db.emails).toEqual([{ id: 4, email: "test-other@example.com", actor: "TEST admin" }]);
    expect(db.revoked).toEqual([]);
    // The desk can't change the CEO login's email at all.
    expect((await PATCH(send("PATCH", { id: 1, email: "test-new@example.com" }))).status).toBe(403);
    expect(db.emails).toHaveLength(1);
  });

  it("switching a login back on grants nothing", async () => {
    auth.role = "ceo";
    expect((await PATCH(send("PATCH", { id: 3, active: true }))).status).toBe(200);
    expect(db.revoked).toEqual([]);
  });
});
