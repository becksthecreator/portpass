import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Wedding Desk's "create the first account" door with the founder check
// and the staff accounts replaced by fakes. The Wedding Desk has had no
// login yet, so this door is the one a stranger could reach today: it is
// set up by a signed-in PortPass founder only (audit finding 9).
const state = vi.hoisted(() => ({ founder: false }));

vi.mock("@/lib/auth/admin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdminApi: vi.fn(async () =>
      state.founder ? { ok: true, session: { userId: "test-founder" } } : { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) },
    ),
  };
});

vi.mock("@/app/weddings/staff-auth", () => ({
  WEDDING_STAFF_COOKIE: "portpass_wedding_staff",
  createBootstrapWeddingAdmin: vi.fn(async () => ({ id: 1 })),
  makeWeddingStaffToken: vi.fn(async () => "test-desk.antonio.signed"),
}));

import { createBootstrapWeddingAdmin } from "@/app/weddings/staff-auth";
import { POST } from "./route";

const setUp = () =>
  POST(new Request("http://localhost/api/weddings/staff/bootstrap-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "TEST Desk", accountKey: "test-desk", pin: "000000" }) }));

beforeEach(() => {
  state.founder = false;
  vi.mocked(createBootstrapWeddingAdmin).mockClear();
});

describe("the Wedding Desk first-account door", () => {
  it("refuses anyone who is not a signed-in founder, and makes nothing", async () => {
    const answer = await setUp();
    expect(answer.status).toBe(401);
    expect(answer.headers.get("set-cookie") ?? "").not.toContain("portpass_wedding_staff=");
    expect(createBootstrapWeddingAdmin).not.toHaveBeenCalled();
  });

  it("lets a signed-in founder set up the first account", async () => {
    state.founder = true;
    const answer = await setUp();
    expect(answer.status).toBe(200);
    expect(createBootstrapWeddingAdmin).toHaveBeenCalledTimes(1);
    expect(answer.headers.get("set-cookie") ?? "").toContain("portpass_wedding_staff=");
  });

  it("the login page asks for a founder before it shows the setup form", () => {
    const page = readFileSync("app/weddings/staff/login/page.tsx", "utf8");
    expect(page).toMatch(/if \(!hasAccount\) await requireAdmin\(/);
  });
});
