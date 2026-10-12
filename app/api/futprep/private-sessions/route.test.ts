import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (C2, C4): the parent's request form, with the database replaced
// by a fake. A chosen place goes through as its id; a coach's day away and
// a place that doesn't take private sessions are refused with plain words.
const calls = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>>, fail: "" }));

vi.mock("@/db/coaches", () => ({
  createPrivateSessionRequest: vi.fn(async (input: Record<string, unknown>) => {
    if (calls.fail) throw new Error(calls.fail);
    calls.created.push(input);
    return { referenceCode: "FP-S-TEST", id: 1 };
  }),
}));
vi.mock("@/db/privateSessionNotices", () => ({ notifyNewPrivateSessionRequest: vi.fn(async () => 0) }));
vi.mock("@/lib/afterResponse", () => ({ afterResponse: vi.fn() }));

import { POST } from "./route";

let n = 0;
const post = (extra: Record<string, unknown>) => {
  n += 1;
  return POST(new Request("http://localhost/api/futprep/private-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${n}` },
    body: JSON.stringify({ parentName: "TEST Parent", parentEmail: `test-parent-${n}@example.com`, parentPhone: "242-555-0101", childName: "TEST Child", childAge: 8, requestedDate: "2099-01-05", requestedStartTime: "16:00", durationMinutes: 60, preferredCoachId: 12, ...extra }),
  }));
};

beforeEach(() => {
  calls.created = [];
  calls.fail = "";
});

describe("a parent's private-session request (brief 31, C2 and C4)", () => {
  it("passes a chosen place through as its id, and a suggestion as words", async () => {
    expect((await post({ locationId: 68 })).status).toBe(200);
    expect((await post({ locationPreference: "TEST our garden" })).status).toBe(200);
    expect(calls.created[0]).toMatchObject({ locationId: 68 });
    expect(calls.created[1]).toMatchObject({ locationId: null, locationPreference: "TEST our garden" });
  });

  it("says the coach is away that day", async () => {
    calls.fail = "COACH_AWAY|Coach TEST is away that day. Pick another day.";
    const response = await post({});
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Coach TEST is away that day. Pick another day.");
  });

  it("refuses a place that doesn't take private sessions", async () => {
    calls.fail = "LOCATION_NOT_AVAILABLE";
    expect((await post({ locationId: 1 })).status).toBe(409);
  });

  it("refuses an empty form and fields it never reads", async () => {
    expect((await post({ parentName: "" })).status).toBe(400);
    expect((await post({ locationCost: 4000 })).status).toBe(400);
    expect(calls.created).toEqual([]);
  });
});
