import { beforeEach, describe, expect, it, vi } from "vitest";

// Rule 3: a parent's free text on a private-session request (goal, notes) can carry
// the child's health details, so the business export leaves them off. The
// database and the exports bucket are fakes; the test reads the file as it
// would be stored.
const fake = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, body: "" }));

vi.mock("./audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("./supabase", () => {
  const query = (table: string) => {
    let first = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      order: () => q,
      eq: () => q,
      in: () => q,
      range: (from: number) => {
        first = from;
        return q;
      },
      maybeSingle: async () => ({ data: fake.rows[table]?.[0] ?? null, error: null }),
      then: (resolve: (result: unknown) => unknown) => resolve({ data: first === 0 ? (fake.rows[table] ?? []) : [], error: null }),
    };
    return q;
  };
  return {
    getSupabaseAdmin: () => ({
      from: query,
      storage: {
        from: () => ({
          upload: async (_path: string, body: Buffer) => {
            fake.body = body.toString("utf8");
            return { error: null };
          },
          createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/export.json" }, error: null }),
        }),
      },
    }),
    throwIfSupabaseError: () => {},
  };
});

import { exportBusinessData } from "./businessExport";

beforeEach(() => {
  fake.body = "";
  fake.rows = {
    organizations: [{ id: 9, name: "TEST Football", slug: "test-football" }],
    private_session_requests: [
      { id: 1, organization_id: 9, reference_code: "FP-S-TEST1", parent_name: "TEST Parent", parent_email: "parent@example.com", parent_phone: "242-555-0101", child_name: "TEST Child", session_goal: "TEST passing, mind the asthma", notes: "TEST asthma, inhaler in the bag" },
    ],
  };
});

describe("the business export", () => {
  it("leaves a parent's goal and notes off every private-session request", async () => {
    await exportBusinessData(9, "test-user", new Date("2026-10-12T12:00:00Z"));
    const file = JSON.parse(fake.body);
    const [request] = file.data.private_session_requests;
    expect(request).not.toHaveProperty("notes");
    expect(request).not.toHaveProperty("session_goal");
    expect(request).toMatchObject({ reference_code: "FP-S-TEST1", child_name: "TEST Child" });
    expect(fake.body).not.toMatch(/inhaler|asthma/);
  });
});
