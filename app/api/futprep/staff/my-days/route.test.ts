import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (C2): a coach sets their own working days and days away. The
// coach comes from the login, never from the request.
const who = vi.hoisted(() => ({ account: "test-coach" as string | null, role: "coach" as string | null, coachId: 12 as number | null }));
const calls = vi.hoisted(() => ({ days: [] as Array<{ coachId: number; days: number[] }>, away: [] as Array<{ coachId: number; date: string; away: boolean }> }));

vi.mock("@/app/futprep/staff/private-sessions/viewer", () => ({
  currentInboxViewer: vi.fn(async () => ({ account: who.account, viewer: { role: who.role, coachId: who.coachId } })),
}));
vi.mock("@/db/coaches", () => ({
  setCoachWorkingDays: vi.fn(async (coachId: number, days: number[]) => {
    calls.days.push({ coachId, days });
  }),
  setCoachDayAway: vi.fn(async (input: { coachId: number; date: string; away: boolean }) => {
    calls.away.push({ coachId: input.coachId, date: input.date, away: input.away });
  }),
  getCoachDays: vi.fn(async (coachId: number) => ({ coachId, name: "TEST Coach", workingDays: [1, 3], daysAway: [] })),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/futprep/staff/my-days", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  who.account = "test-coach";
  who.role = "coach";
  who.coachId = 12;
  calls.days = [];
  calls.away = [];
});

describe("My days (brief 31, C2)", () => {
  it("saves the signed-in coach's own working days and days away", async () => {
    expect((await post({ workingDays: [5, 1, 3] })).status).toBe(200);
    expect((await post({ date: "2099-01-05", away: true })).status).toBe(200);
    expect((await post({ date: "2099-01-05", away: false })).status).toBe(200);
    expect(calls.days).toEqual([{ coachId: 12, days: [1, 3, 5] }]);
    expect(calls.away).toEqual([{ coachId: 12, date: "2099-01-05", away: true }, { coachId: 12, date: "2099-01-05", away: false }]);
  });

  it("never takes a coach from the request", async () => {
    expect((await post({ coachId: 11, workingDays: [1] })).status).toBe(400);
    expect(calls.days).toEqual([]);
  });

  it("refuses a helper, a login with no profile, and no login", async () => {
    who.role = "helper";
    expect((await post({ workingDays: [1] })).status).toBe(403);
    who.role = "coach";
    who.coachId = null;
    expect((await post({ workingDays: [1] })).status).toBe(409);
    who.account = null;
    who.role = null;
    expect((await post({ workingDays: [1] })).status).toBe(401);
    expect(calls.days).toEqual([]);
  });

  it("refuses days that aren't days and dates that aren't dates", async () => {
    expect((await post({ workingDays: [0, 8] })).status).toBe(400);
    expect((await post({ workingDays: "Monday" })).status).toBe(400);
    expect((await post({ date: "soon", away: true })).status).toBe(400);
    expect((await post({ date: "2000-01-03", away: true })).status).toBe(400);
    expect((await post({ workingDays: [1], date: "2099-01-05", away: true })).status).toBe(400);
  });
});
