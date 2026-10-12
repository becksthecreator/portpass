import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (D): one tap saves one mark, for the signed-in coach's own
// player, in its window; the desk any child, any time. The staff session
// and the database are fakes: child 1 is in coach A's (11) class, child 2
// in coach B's (12) class.
const who = vi.hoisted(() => ({ account: "test-coach-a" as string | null, role: "coach" as string | null, coachId: 11 as number | null }));
const state = vi.hoisted(() => ({ saved: [] as Array<{ registrationId: number; skillId: number; phase: string; score: number }>, windows: { start: true, end: false } }));

// The guard is server-only; the unit runner has no server.
vi.mock("server-only", () => ({}));
vi.mock("@/app/futprep/staff/private-sessions/viewer", () => ({
  currentInboxViewer: vi.fn(async () => ({ account: who.account, viewer: { role: who.role, coachId: who.coachId } })),
}));
vi.mock("@/db/passports", () => ({
  passportCoaches: vi.fn(async (id: number) => (id === 1 ? { leadCoachId: 11 } : id === 2 ? { leadCoachId: 12 } : null)),
  passportWindows: vi.fn(async () => ({ ...state.windows, startOpens: null, startCloses: null, endOpens: null, endCloses: null })),
  savePassportMark: vi.fn(async (input: { registrationId: number; skillId: number; phase: string; score: number }) => {
    state.saved.push({ registrationId: input.registrationId, skillId: input.skillId, phase: input.phase, score: input.score });
  }),
  getStaffPassport: vi.fn(async (id: number) => ({ registrationId: id })),
}));

import { GET, POST } from "./route";

const tap = (body: unknown) => POST(new Request("http://localhost/api/futprep/staff/passports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const open = (id: number) => GET(new Request(`http://localhost/api/futprep/staff/passports?registrationId=${id}`));

beforeEach(() => {
  who.account = "test-coach-a";
  who.role = "coach";
  who.coachId = 11;
  state.saved = [];
  state.windows = { start: true, end: false };
});

describe("scoring a passport (brief 31, D)", () => {
  it("saves one tap for the coach's own player", async () => {
    expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score: 4 })).status).toBe(200);
    expect(state.saved).toEqual([{ registrationId: 1, skillId: 5, phase: "start", score: 4 }]);
    expect((await open(1)).status).toBe(200);
  });

  it("refuses another coach's player, by API and by URL", async () => {
    expect((await tap({ registrationId: 2, skillId: 5, phase: "start", score: 4 })).status).toBe(403);
    expect((await open(2)).status).toBe(403);
    expect((await open(9)).status).toBe(404);
    expect(state.saved).toEqual([]);
  });

  it("keeps a coach to the windows: start marks in week 1, end marks in the last two weeks", async () => {
    expect((await tap({ registrationId: 1, skillId: 5, phase: "end", score: 4 })).status).toBe(409);
    state.windows = { start: false, end: false };
    expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score: 4 })).status).toBe(409);
    expect(state.saved).toEqual([]);
  });

  it("lets the desk score any child at any time", async () => {
    who.role = "admin";
    who.coachId = null;
    state.windows = { start: false, end: false };
    expect((await tap({ registrationId: 2, skillId: 5, phase: "end", score: 3 })).status).toBe(200);
    expect(state.saved).toEqual([{ registrationId: 2, skillId: 5, phase: "end", score: 3 }]);
  });

  it("refuses a helper, a coach with no profile, and no login", async () => {
    who.role = "helper";
    expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score: 4 })).status).toBe(403);
    who.role = "coach";
    who.coachId = null;
    expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score: 4 })).status).toBe(409);
    who.account = null;
    who.role = null;
    expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score: 4 })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("takes a mark only as a whole number from 1 to 5, and no field it never reads", async () => {
    for (const score of [0, 6, 2.5, "3"]) expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score })).status).toBe(400);
    expect((await tap({ registrationId: 1, skillId: 5, phase: "middle", score: 3 })).status).toBe(400);
    expect((await tap({ registrationId: 1, skillId: 5, phase: "start", score: 3, coachId: 12 })).status).toBe(400);
    expect((await tap({})).status).toBe(400);
    expect(state.saved).toEqual([]);
  });
});
