import { beforeEach, describe, expect, it, vi } from "vitest";

// Rule 3: a parent's free text on a private-session request (goal, notes) can carry
// the child's health details, so the business export leaves them off. The
// database and the exports bucket are fakes; the test reads the file as it
// would be stored.
const fake = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, body: "", orders: {} as Record<string, string[]> }));

vi.mock("./audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("./supabase", () => {
  const query = (table: string) => {
    let first = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      order: (column: string) => {
        (fake.orders[table] ??= []).push(column);
        return q;
      },
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
  fake.orders = {};
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

  // Four exported tables have no id column: ordering them by id made the
  // whole export fail for every business (found 23 Nov).
  it("orders the tables without an id by their own key", async () => {
    await exportBusinessData(9, "test-user", new Date("2026-10-12T12:00:00Z"));
    expect(fake.orders.organization_categories).toEqual(["organization_id", "category_id"]);
    expect(fake.orders.organization_payment_settings).toEqual(["organization_id"]);
    expect(fake.orders.shops).toEqual(["organization_id"]);
    expect(fake.orders.drop_items).toEqual(["drop_id", "product_id"]);
    expect(fake.orders.programs).toEqual(["id"]);
  });

  it("leaves a parent's booking notes and the audit log's IP addresses out", async () => {
    fake.rows.booking_requests = [{ id: 5, organization_id: 9, reference_code: "B-TEST", child_first_name: "TEST", notes: "TEST has a nut allergy" }];
    fake.rows.audit_log = [{ id: 6, organization_id: 9, action: "TEST", ip: "203.0.113.7" }];
    await exportBusinessData(9, "test-user", new Date("2026-10-12T12:00:00Z"));
    expect(fake.body).not.toMatch(/nut allergy|203\.0\.113\.7/);
    expect(JSON.parse(fake.body).data.booking_requests[0]).toMatchObject({ reference_code: "B-TEST" });
  });

  it("leaves link tokens out: a reservation's receipt and a drop's followers link", async () => {
    fake.rows.reservations = [{ id: 3, organization_id: 9, reference_code: "R-TEST", receipt_token: "TEST-receipt-secret" }];
    fake.rows.drops = [{ id: 4, organization_id: 9, title: "TEST drop", followers_token: "TEST-followers-secret" }];
    await exportBusinessData(9, "test-user", new Date("2026-10-12T12:00:00Z"));
    expect(fake.body).not.toMatch(/receipt-secret|followers-secret/);
    expect(JSON.parse(fake.body).data.reservations[0]).toMatchObject({ reference_code: "R-TEST" });
  });
});
