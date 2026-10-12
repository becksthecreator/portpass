import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (C5): the CEO or an admin sets what a coach is paid for a 30-
// and a 60-minute private session; a coach or helper cannot.
const auth = vi.hoisted(() => ({ role: "admin" as string | null, ownCoachId: null as number | null }));
const calls = vi.hoisted(() => ({ saved: [] as Array<{ coachId: number; private30Cents: number | null; private60Cents: number | null }> }));

vi.mock("@/app/futprep/staff-auth", () => ({
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  currentFutprepStaffName: vi.fn(async () => "TEST Desk"),
  currentFutprepStaffId: vi.fn(async () => 39),
}));
vi.mock("@/db/coachPay", () => ({
  coachForStaffMember: vi.fn(async () => {
    if (auth.ownCoachId === -1) throw new Error("TEST lookup failed");
    return auth.ownCoachId === null ? null : { id: auth.ownCoachId };
  }),
  setPrivatePayRates: vi.fn(async (input: { coachId: number; private30Cents: number | null; private60Cents: number | null }) => {
    calls.saved.push({ coachId: input.coachId, private30Cents: input.private30Cents, private60Cents: input.private60Cents });
    return { id: input.coachId, private30PayCents: input.private30Cents, private60PayCents: input.private60Cents };
  }),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/futprep/staff/private-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  auth.role = "admin";
  auth.ownCoachId = null;
  calls.saved = [];
});

describe("private session pay rates (brief 31, C5)", () => {
  it("an admin or the CEO sets them in dollars, and a blank clears one", async () => {
    expect((await post({ coachId: 12, private30: "20", private60: "$35.50" })).status).toBe(200);
    auth.role = "ceo";
    expect((await post({ coachId: 12, private30: "", private60: "40" })).status).toBe(200);
    expect(calls.saved).toEqual([{ coachId: 12, private30Cents: 2000, private60Cents: 3550 }, { coachId: 12, private30Cents: null, private60Cents: 4000 }]);
  });

  it("a coach or helper cannot, nor anyone signed out", async () => {
    for (const role of ["coach", "helper"]) {
      auth.role = role;
      expect((await post({ coachId: 12, private30: "20" })).status).toBe(403);
    }
    auth.role = null;
    expect((await post({ coachId: 12, private30: "20" })).status).toBe(401);
    expect(calls.saved).toEqual([]);
  });

  it("an admin who coaches can't set their own; the CEO can", async () => {
    auth.ownCoachId = 12;
    expect((await post({ coachId: 12, private30: "90" })).status).toBe(403);
    expect((await post({ coachId: 13, private30: "20" })).status).toBe(200);
    auth.role = "ceo";
    expect((await post({ coachId: 12, private30: "30" })).status).toBe(200);
    expect(calls.saved.map((s) => s.coachId)).toEqual([13, 12]);
  });

  it("an admin's save waits if it can't tell whose login it is", async () => {
    auth.ownCoachId = -1;
    expect((await post({ coachId: 12, private30: "90" })).status).toBe(503);
    expect(calls.saved).toEqual([]);
  });

  it("refuses an amount that isn't one, and fields it never reads", async () => {
    expect((await post({ coachId: 12, private30: "-5" })).status).toBe(400);
    expect((await post({ coachId: 12, private30: "twenty" })).status).toBe(400);
    expect((await post({ coachId: 12, private30: "20", defaultLeadPayCents: 9999 })).status).toBe(400);
  });
});
