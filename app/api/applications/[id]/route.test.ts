import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAdminToken, PORTPASS_ADMIN_COOKIE } from "@/lib/admin-auth";

// Regression test for the hole closed in BUILD_PLAN stage 0: this endpoint
// used to accept an approve/reject decision from anyone on the internet.
// Mock next/headers the same way lib/admin-session.test.ts does, so this
// exercises the real currentPortpassAdmin() implementation the route calls
// rather than a stand-in - if someone loosens the check back open, this
// fails without needing a database at all, because the unauthorized path
// returns before reviewApplication() (and therefore Supabase) is ever
// reached.
let cookieValue: string | undefined;

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === PORTPASS_ADMIN_COOKIE && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

const ORIGINAL_PIN = process.env.PORTPASS_ADMIN_PIN;

describe("PATCH /api/applications/[id]", () => {
  beforeEach(() => {
    process.env.PORTPASS_ADMIN_PIN = "4242";
    cookieValue = undefined;
  });

  afterEach(() => {
    if (ORIGINAL_PIN === undefined) delete process.env.PORTPASS_ADMIN_PIN;
    else process.env.PORTPASS_ADMIN_PIN = ORIGINAL_PIN;
  });

  it("rejects an unauthenticated request with 401 before touching the database", async () => {
    const { PATCH } = await import("./route");
    const request = new Request("https://portpass.test/api/applications/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
  });

  it("rejects a request with a garbage cookie the same way", async () => {
    cookieValue = "not-a-real-token";
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
