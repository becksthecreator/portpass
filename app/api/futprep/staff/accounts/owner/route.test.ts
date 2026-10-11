import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (A4, after review): the staff side of the owner bridge, with
// the staff session and the database replaced by fakes. Only an admin or
// the CEO can mark the owner, and marking only asks: the route never
// writes a membership (db/futprepOwner.ts markFutprepOwner doesn't either;
// the integration test proves that half).
const auth = vi.hoisted(() => ({ role: null as string | null }));
const calls = vi.hoisted(() => ({ marked: [] as Array<{ staffId: number; actorName: string }>, fail: "" }));

vi.mock("@/app/futprep/staff-auth", () => ({
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  currentFutprepStaffName: vi.fn(async () => (auth.role ? `TEST ${auth.role}` : null)),
  listStaffAccounts: vi.fn(async () => []),
  listStaffWithoutLogin: vi.fn(async () => []),
}));
vi.mock("@/db/futprepOwner", () => ({
  markFutprepOwner: vi.fn(async (input: { staffId: number; actorName: string }) => {
    if (calls.fail) throw new Error(calls.fail);
    calls.marked.push(input);
    return { state: "waiting_for_founder", name: "TEST Owner", email: "test-owner@example.com" };
  }),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/futprep/staff/accounts/owner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  auth.role = null;
  calls.marked = [];
  calls.fail = "";
});

describe("marking Futprep's owner from Staff accounts", () => {
  it("refuses a signed-out request, a coach and a helper", async () => {
    expect((await post({ id: 1 })).status).toBe(401);
    for (const role of ["coach", "helper"]) {
      auth.role = role;
      expect((await post({ id: 1 })).status).toBe(403);
    }
    expect(calls.marked).toEqual([]);
  });

  it("lets an admin or the CEO mark a login, and says it waits for a founder", async () => {
    for (const role of ["admin", "ceo"]) {
      auth.role = role;
      const response = await post({ id: 7 });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, state: "waiting_for_founder" });
    }
    expect(calls.marked).toEqual([{ staffId: 7, actorName: "TEST admin" }, { staffId: 7, actorName: "TEST ceo" }]);
  });

  it("refuses a login that isn't a CEO's, a missing one, and fields it never reads", async () => {
    auth.role = "admin";
    calls.fail = "NOT_A_CEO";
    expect((await post({ id: 7 })).status).toBe(400);
    calls.fail = "ROW_NOT_FOUND";
    expect((await post({ id: 7 })).status).toBe(404);
    calls.fail = "";
    expect((await post({ id: 7, userId: "00000000-0000-0000-0000-000000000000" })).status).toBe(400);
    expect((await post({ id: "x" })).status).toBe(400);
    expect(calls.marked).toEqual([]);
  });
});
