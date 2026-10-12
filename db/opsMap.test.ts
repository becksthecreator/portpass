import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (B, security review): the operating map never loads everyone's
// class pay rates for an admin login; only the CEO's map has them. The
// loaders are fakes.
const calls = vi.hoisted(() => ({ pay: 0 }));

vi.mock("./coachPay", () => ({
  listPayCoaches: vi.fn(async () => {
    calls.pay += 1;
    return [{ id: 1, name: "TEST Coach", active: true, defaultLeadPayCents: 5000, defaultAssistantPayCents: 2500, staffMemberId: null }];
  }),
}));
vi.mock("./coaches", () => ({
  listAllCoachProfiles: vi.fn(async () => ({ schemaReady: true, coaches: [] })),
  listFutprepPrivateServices: vi.fn(async () => []),
}));
vi.mock("./futprepLocations", () => ({ listFutprepLocations: vi.fn(async () => []) }));
vi.mock("./programs", () => ({
  futprepOrganizationId: vi.fn(async () => 1),
  listFutprepPrograms: vi.fn(async () => []),
}));
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) }),
  throwIfSupabaseError: () => {},
}));

import { loadOpsMap } from "./opsMap";

beforeEach(() => {
  calls.pay = 0;
});

describe("the operating map's pay rates (brief 31, B)", () => {
  it("an admin's map has no class pay rates, and they are never even loaded", async () => {
    const map = await loadOpsMap("admin");
    expect(map.pay).toBeNull();
    expect(calls.pay).toBe(0);
  });

  it("the CEO's map has them", async () => {
    const map = await loadOpsMap("ceo");
    expect(map.pay).toHaveLength(1);
    expect(calls.pay).toBe(1);
  });
});
