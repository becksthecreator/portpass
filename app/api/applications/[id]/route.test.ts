import { describe, expect, it, vi } from "vitest";

// Regression test for the hole closed in BUILD_PLAN stage 0: this endpoint
// used to accept an approve/reject decision from anyone on the internet.
// With no auth cookies (and no Supabase auth env in a unit run) the guard
// answers 401 before reviewApplication() -- and therefore the database --
// is ever reached.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
  }),
}));

describe("PATCH /api/applications/[id]", () => {
  it("rejects an unauthenticated request with 401 before touching the database", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const { PATCH } = await import("./route");
    const request = new Request("https://portpass.test/api/applications/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
  });
});
