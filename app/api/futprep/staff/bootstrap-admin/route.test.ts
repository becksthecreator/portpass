import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Futprep "create the first admin" door with the founder check and the
// staff accounts replaced by fakes. The first login is set up by a signed-in
// PortPass founder, never by whoever finds the page (audit finding 9): the
// route refuses before it reads the body or touches an account, and the
// login page sends anyone else to sign in before showing the form.
const state = vi.hoisted(() => ({ founder: false }));

vi.mock("@/lib/auth/admin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdminApi: vi.fn(async () =>
      state.founder ? { ok: true, session: { userId: "test-founder" } } : { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) },
    ),
  };
});

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
  state.founder = false;
  vi.mocked(createBootstrapAdmin).mockClear();
});

describe("the Futprep first-admin door", () => {
  it("refuses anyone who is not a signed-in founder, and makes nothing", async () => {
    const answer = await setUp();
    expect(answer.status).toBe(401);
    expect(answer.headers.get("set-cookie") ?? "").not.toContain("portpass_futprep_staff=");
    expect(createBootstrapAdmin).not.toHaveBeenCalled();
  });

  it("lets a signed-in founder set up the first admin", async () => {
    state.founder = true;
    const answer = await setUp();
    expect(answer.status).toBe(200);
    expect(createBootstrapAdmin).toHaveBeenCalledTimes(1);
    expect(answer.headers.get("set-cookie") ?? "").toContain("portpass_futprep_staff=");
  });

  it("the login page asks for a founder before it shows the setup form", () => {
    const page = readFileSync("app/futprep/staff/login/page.tsx", "utf8");
    expect(page).toMatch(/if \(!hasAccount\) await requireAdmin\(/);
  });
});
