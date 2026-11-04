import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Futprep "create the first admin" door with the admin check and the
// staff accounts replaced by fakes. The first login is set up by a signed-in
// PortPass platform owner, never by whoever finds the page (audit finding
// 9; owner only, Antonio's call): the route refuses before it reads the
// body or touches an account, and the login page sends anyone else away
// before showing the form.
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

vi.mock("@/app/futprep/staff-auth", () => ({
  FUTPREP_STAFF_COOKIE: "portpass_futprep_staff",
  createBootstrapAdmin: vi.fn(async () => ({ id: 1 })),
  makeStaffToken: vi.fn(async () => "test-admin.admin.signed"),
}));

import { createBootstrapAdmin } from "@/app/futprep/staff-auth";
import { POST } from "./route";

const setUp = () =>
  POST(new Request("http://localhost/api/futprep/staff/bootstrap-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "TEST Desk", accountKey: "test-desk", pin: "000000" }) }));

beforeEach(() => {
  state.role = null;
  vi.mocked(createBootstrapAdmin).mockClear();
});

describe("the Futprep first-admin door", () => {
  it("refuses anyone who is not signed in as PortPass staff, and makes nothing", async () => {
    const answer = await setUp();
    expect(answer.status).toBe(401);
    expect(answer.headers.get("set-cookie") ?? "").not.toContain("portpass_futprep_staff=");
    expect(createBootstrapAdmin).not.toHaveBeenCalled();
  });

  it("refuses a platform admin who is not an owner, and makes nothing", async () => {
    state.role = "platform_admin";
    const answer = await setUp();
    expect(answer.status).toBe(403);
    expect(createBootstrapAdmin).not.toHaveBeenCalled();
  });

  it("lets a signed-in platform owner set up the first admin", async () => {
    state.role = "platform_owner";
    const answer = await setUp();
    expect(answer.status).toBe(200);
    expect(createBootstrapAdmin).toHaveBeenCalledTimes(1);
    expect(answer.headers.get("set-cookie") ?? "").toContain("portpass_futprep_staff=");
  });

  it("the login page asks for a platform owner before it shows the setup form", () => {
    const page = readFileSync("app/futprep/staff/login/page.tsx", "utf8");
    expect(page).toMatch(/if \(!hasAccount\) \{\s*const session = await requireAdmin\(/);
    expect(page).toMatch(/hasPlatformRole\(session, "platform_owner"\)\) notFound\(\)/);
  });
});
