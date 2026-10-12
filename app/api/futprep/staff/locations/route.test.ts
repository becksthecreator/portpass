import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (B1): the Locations route, with the staff session and the
// database replaced by fakes. The CEO and admin logins change places and
// their costs; a coach or helper cannot, and nothing is ever deleted.
const auth = vi.hoisted(() => ({ role: "admin" as string | null }));
const calls = vi.hoisted(() => ({ created: [] as unknown[], updated: [] as unknown[], switched: [] as unknown[] }));

vi.mock("@/app/futprep/staff-auth", () => ({
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  currentFutprepStaffName: vi.fn(async () => "TEST Desk"),
}));
vi.mock("@/db/futprepLocations", () => ({
  listFutprepLocations: vi.fn(async () => []),
  createFutprepLocation: vi.fn(async (input: { name?: string }, actor: string) => {
    if (input.name === "TEST Taken") throw new Error("NAME_TAKEN");
    calls.created.push({ input, actor });
    return 99;
  }),
  updateFutprepLocation: vi.fn(async (id: number, input: unknown) => {
    if (id === 404) throw new Error("LOCATION_NOT_FOUND");
    calls.updated.push({ id, input });
  }),
  setFutprepLocationActive: vi.fn(async (id: number, active: boolean) => {
    calls.switched.push({ id, active });
  }),
}));

import { PATCH, POST } from "./route";

const send = (method: "POST" | "PATCH", body: unknown) =>
  (method === "POST" ? POST : PATCH)(new Request("http://localhost/api/futprep/staff/locations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  auth.role = "admin";
  calls.created = [];
  calls.updated = [];
  calls.switched = [];
});

describe("Futprep locations (brief 31, B1)", () => {
  it("an admin adds a place with its cost in cents", async () => {
    const response = await send("POST", { name: "TEST Field", costModel: "per_hour", cost: "40" });
    expect(response.status).toBe(200);
    expect(calls.created).toEqual([{ input: expect.objectContaining({ name: "TEST Field", costModel: "per_hour", costCents: 4000 }), actor: "TEST Desk" }]);
  });

  it("the CEO saves a place's cost and days", async () => {
    auth.role = "ceo";
    const response = await send("PATCH", { id: 68, name: "LCIS Lower Campus", costModel: "per_session", cost: "25", daysAvailable: [1, 3], privateSessionsOk: true });
    expect(response.status).toBe(200);
    expect(calls.updated).toEqual([{ id: 68, input: expect.objectContaining({ costCents: 2500, daysAvailable: [1, 3], privateSessionsOk: true }) }]);
  });

  it("switches a place off rather than deleting it", async () => {
    expect((await send("PATCH", { id: 1, active: false })).status).toBe(200);
    expect(calls.switched).toEqual([{ id: 1, active: false }]);
    expect(calls.updated).toEqual([]);
  });

  it("a coach or helper cannot change a place", async () => {
    for (const role of ["coach", "helper"]) {
      auth.role = role;
      expect((await send("POST", { name: "TEST Field" })).status).toBe(403);
      expect((await send("PATCH", { id: 68, active: false })).status).toBe(403);
    }
    auth.role = null;
    expect((await send("POST", { name: "TEST Field" })).status).toBe(401);
    expect(calls).toEqual({ created: [], updated: [], switched: [] });
  });

  it("refuses unknown fields, bad amounts and a missing place", async () => {
    expect((await send("POST", { name: "TEST Field", organizationId: 2 })).status).toBe(400);
    expect((await send("POST", { name: "TEST Field", costModel: "per_hour", cost: "forty" })).status).toBe(400);
    expect((await send("PATCH", { id: "x", active: false })).status).toBe(400);
    expect((await send("PATCH", { id: 68, active: "no" })).status).toBe(400);
    expect((await send("PATCH", { id: 404, name: "TEST Field" })).status).toBe(404);
    expect((await send("POST", { name: "TEST Taken" })).status).toBe(409);
  });
});
