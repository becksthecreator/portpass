import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Wedding Desk's "create the first account" door with the admin check
// and the staff accounts replaced by fakes. The Wedding Desk has had no
// login yet, so this door is the one a stranger could reach today: it is
// set up by a signed-in PortPass platform owner only (audit finding 9;
// owner only, Antonio's call).
const state = vi.hoisted(() => ({ role: null as null | "platform_admin" | "platform_owner" }));

// requireAdminApi passes any platform admin or owner at the second step.
vi.mock("@/lib/auth/admin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdminApi: vi.fn(async () =>
      state.role ? { ok: true, session: { userId: "test-founder", platformRole: state.role } } : { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) },
    ),
  };
});

vi.mock("@/lib/auth/guards", () => ({
  hasPlatformRole: (session: { platformRole: string | null }, min: string) => session.platformRole === "platform_owner" || (min === "platform_admin" && session.platformRole === "platform_admin"),
}));

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
  state.role = null;
  vi.mocked(createBootstrapWeddingAdmin).mockClear();
});

describe("the Wedding Desk first-account door", () => {
  it("refuses anyone who is not signed in as PortPass staff, and makes nothing", async () => {
    const answer = await setUp();
    expect(answer.status).toBe(401);
    expect(answer.headers.get("set-cookie") ?? "").not.toContain("portpass_wedding_staff=");
    expect(createBootstrapWeddingAdmin).not.toHaveBeenCalled();
  });

  it("refuses a platform admin who is not an owner, and makes nothing", async () => {
    state.role = "platform_admin";
    const answer = await setUp();
    expect(answer.status).toBe(403);
    expect(createBootstrapWeddingAdmin).not.toHaveBeenCalled();
  });

  it("lets a signed-in platform owner set up the first account", async () => {
    state.role = "platform_owner";
    const answer = await setUp();
    expect(answer.status).toBe(200);
    expect(createBootstrapWeddingAdmin).toHaveBeenCalledTimes(1);
    expect(answer.headers.get("set-cookie") ?? "").toContain("portpass_wedding_staff=");
  });

  it("the login page asks for a platform owner before it shows the setup form", () => {
    const page = readFileSync("app/weddings/staff/login/page.tsx", "utf8");
    expect(page).toMatch(/if \(!hasAccount\) \{\s*const session = await requireAdmin\(/);
    expect(page).toMatch(/hasPlatformRole\(session, "platform_owner"\)\) notFound\(\)/);
  });
});
