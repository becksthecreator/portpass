import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (C1): a coach records a payment only on their own private
// session; another coach's answers 404 and nothing is written.
// The form sends one key per payment; the route passes it to the database,
// which records a repeated key once. A press without a key (a page from
// before the key) is refused, not recorded.
const who = vi.hoisted(() => ({ role: "coach" as string, coachId: 12 as number | null }));
const calls = vi.hoisted(() => ({ recorded: [] as number[], inputs: [] as Array<Record<string, unknown>> }));

vi.mock("@/app/futprep/staff/private-sessions/viewer", () => ({
  currentInboxViewer: vi.fn(async () => ({ account: "test-coach", viewer: { role: who.role, coachId: who.coachId } })),
  inboxRequests: vi.fn(async () => ({ schemaReady: true, requests: [] })),
}));
vi.mock("@/db/coaches", () => ({
  privateSessionOwners: vi.fn(async (id: number) => (id === 1 ? { preferred_coach_id: 11, assigned_coach_id: null } : id === 2 ? { preferred_coach_id: 12, assigned_coach_id: null } : id === 3 ? { preferred_coach_id: 12, assigned_coach_id: 11 } : null)),
  recordPrivateSessionPayment: vi.fn(async (input: { requestId: number }) => {
    calls.recorded.push(input.requestId);
    calls.inputs.push(input);
    return { paymentStatus: "paid", paidCents: 3500 };
  }),
}));

import { POST } from "./route";

const KEY = "not-real-payment-key-0001";
const post = (id: number, body: unknown) => POST(new Request(`http://localhost/api/futprep/private-sessions/${id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(id) }) });
const PAID = { amountDollars: 35, method: "cash", reference: "TEST", idempotencyKey: KEY };

beforeEach(() => {
  who.role = "coach";
  who.coachId = 12;
  calls.recorded = [];
  calls.inputs = [];
});

describe("recording a private-session payment (brief 31, C1)", () => {
  it("a coach can't record one on another coach's request", async () => {
    expect((await post(1, PAID)).status).toBe(404);
    expect((await post(9, PAID)).status).toBe(404);
    expect(calls.recorded).toEqual([]);
  });

  it("a coach records one on their own, and the desk on any", async () => {
    expect((await post(2, PAID)).status).toBe(201);
    who.role = "admin";
    who.coachId = null;
    expect((await post(1, PAID)).status).toBe(201);
    expect(calls.recorded).toEqual([2, 1]);
  });

  it("the coach a request was referred away from can't record a payment on it", async () => {
    expect((await post(3, PAID)).status).toBe(403);
    expect(calls.recorded).toEqual([]);
  });

  it("refuses a bad amount and fields it never reads", async () => {
    expect((await post(2, { ...PAID, amountDollars: 0 })).status).toBe(400);
    expect((await post(2, { ...PAID, requestId: 1 })).status).toBe(400);
  });
});

describe("recording a private session payment once", () => {
  it("passes the form's key to the database", async () => {
    expect((await post(2, PAID)).status).toBe(201);
    expect(calls.inputs).toEqual([{ requestId: 2, amountCents: 3500, method: "cash", reference: "TEST", recordedBy: "test-coach", idempotencyKey: KEY }]);
  });

  it("refuses a press without a key, or with one that isn't a key, and records nothing", async () => {
    for (const idempotencyKey of [undefined, "", "short", 42, "x".repeat(65), "not a key; drop table"]) {
      const response = await post(2, { ...PAID, idempotencyKey });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Refresh the page and try again." });
    }
    expect(calls.recorded).toEqual([]);
  });
});
