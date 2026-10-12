import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (C1): a coach can't load or act on another coach's request by
// URL or API. The staff session and the database are fakes: coach A (11)
// owns request 1, coach B (12) owns request 2, request 3 is for "any
// coach".
const who = vi.hoisted(() => ({ account: "test-coach-b" as string | null, role: "coach" as string | null, coachId: 12 as number | null }));
const calls = vi.hoisted(() => ({ acted: [] as Array<{ id: number; action: string; coachId: number | null }> }));
const REQUESTS = vi.hoisted(() => [
  { id: 1, preferred_coach_id: 11, assigned_coach_id: null, notes: "TEST note A" },
  { id: 2, preferred_coach_id: 12, assigned_coach_id: null, notes: "TEST note B" },
  { id: 3, preferred_coach_id: null, assigned_coach_id: null, notes: "TEST any" },
  { id: 4, preferred_coach_id: 11, assigned_coach_id: 12, notes: "TEST referred to B" },
]);

vi.mock("@/app/futprep/staff/private-sessions/viewer", async () => {
  const access = await import("@/lib/privateSessionAccess");
  return {
    currentInboxViewer: vi.fn(async () => ({ account: who.account, viewer: { role: who.role, coachId: who.coachId } })),
    inboxRequests: vi.fn(async (viewer: { role: "coach" | "admin" | "ceo" | "helper" | null; coachId: number | null }) => ({ schemaReady: true, requests: access.inboxFor(viewer, REQUESTS) })),
  };
});
vi.mock("@/db/coaches", () => ({
  privateSessionOwners: vi.fn(async (id: number) => REQUESTS.find((r) => r.id === id) ?? null),
  actOnPrivateSessionRequest: vi.fn(async (input: { id: number; action: string; coachId: number | null }) => {
    calls.acted.push({ id: input.id, action: input.action, coachId: input.coachId });
  }),
}));

import { PATCH } from "./route";

const patch = (id: number, body: unknown) => PATCH(new Request(`http://localhost/api/futprep/private-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(id) }) });

beforeEach(() => {
  who.account = "test-coach-b";
  who.role = "coach";
  who.coachId = 12;
  calls.acted = [];
});

describe("a coach's own private-session inbox (brief 31, C1)", () => {
  it("coach B gets 404 on coach A's request, whatever the action, and nothing is done", async () => {
    for (const action of ["accept", "decline", "refer", "parent_notified", "complete"]) {
      expect((await patch(1, { action, coachId: 12, targetCoachId: 12, reason: "TEST" })).status).toBe(404);
    }
    expect((await patch(3, { action: "accept" })).status).toBe(404);
    expect(calls.acted).toEqual([]);
  });

  it("on their own request coach B accepts as themselves, and gets back only their own inbox without notes", async () => {
    const response = await patch(2, { action: "accept", coachId: 11 });
    expect(response.status).toBe(200);
    expect(calls.acted).toEqual([{ id: 2, action: "accept", coachId: 12 }]);
    const { requests } = await response.json();
    expect(requests.map((r: { id: number }) => r.id)).toEqual([2, 4]);
    expect(requests[0].notes).toBe("");
  });

  it("a coach login with no profile, a helper, and no login get nothing", async () => {
    who.coachId = null;
    expect((await patch(2, { action: "accept" })).status).toBe(404);
    who.role = "helper";
    who.coachId = 12;
    expect((await patch(2, { action: "accept" })).status).toBe(401);
    who.account = null;
    who.role = null;
    expect((await patch(2, { action: "accept" })).status).toBe(401);
    expect(calls.acted).toEqual([]);
  });

  it("the desk acts on any request with the coach it chooses, and sees every request", async () => {
    who.role = "admin";
    who.coachId = null;
    const response = await patch(3, { action: "accept", coachId: 11 });
    expect(response.status).toBe(200);
    expect(calls.acted).toEqual([{ id: 3, action: "accept", coachId: 11 }]);
    expect((await response.json()).requests).toHaveLength(4);
  });

  it("a request referred away shows to the coach it came from, who can no longer act on it", async () => {
    who.account = "test-coach-a";
    who.coachId = 11;
    for (const action of ["accept", "decline", "complete"]) expect((await patch(4, { action, reason: "TEST" })).status).toBe(403);
    who.coachId = 12;
    expect((await patch(4, { action: "complete" })).status).toBe(200);
    expect(calls.acted).toEqual([{ id: 4, action: "complete", coachId: 12 }]);
  });

  it("refuses unknown actions and fields", async () => {
    expect((await patch(2, { action: "delete" })).status).toBe(400);
    expect((await patch(2, { action: "accept", preferredCoachId: 12 })).status).toBe(400);
  });
});
