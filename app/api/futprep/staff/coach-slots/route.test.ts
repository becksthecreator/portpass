import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (C1): a coach posts open times for their own profile only.
const who = vi.hoisted(() => ({ role: "coach" as string, coachId: 12 as number | null }));
const calls = vi.hoisted(() => ({ added: [] as number[] }));

vi.mock("@/app/futprep/staff/private-sessions/viewer", () => ({
  currentInboxViewer: vi.fn(async () => ({ account: "test-coach", viewer: { role: who.role, coachId: who.coachId } })),
}));
vi.mock("@/db/coaches", () => ({
  addWeeklyCoachSlots: vi.fn(async (input: { coachId: number }) => {
    calls.added.push(input.coachId);
    return 4;
  }),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/futprep/staff/coach-slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const SLOTS = { dayOfWeek: "Wednesday", startTime: "4:00 PM", endTime: "4:45 PM", weeks: 4, location: "TEST field" };

beforeEach(() => {
  who.role = "coach";
  who.coachId = 12;
  calls.added = [];
});

describe("posting open times (brief 31, C1)", () => {
  it("a coach can't post times for another coach", async () => {
    expect((await post({ ...SLOTS, coachId: 11 })).status).toBe(403);
    who.coachId = null;
    expect((await post({ ...SLOTS, coachId: 12 })).status).toBe(403);
    expect(calls.added).toEqual([]);
  });

  it("a coach posts for themselves, and the desk for any coach", async () => {
    expect((await post({ ...SLOTS, coachId: 12 })).status).toBe(201);
    who.role = "admin";
    who.coachId = null;
    expect((await post({ ...SLOTS, coachId: 11 })).status).toBe(201);
    expect(calls.added).toEqual([12, 11]);
  });

  it("a helper is refused, and so are fields it never reads", async () => {
    who.role = "helper";
    expect((await post({ ...SLOTS, coachId: 12 })).status).toBe(401);
    who.role = "coach";
    expect((await post({ ...SLOTS, coachId: 12, status: "blocked" })).status).toBe(400);
  });
});
