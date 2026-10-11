import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Brief 31 (A4, after review): the founder's half of the owner bridge,
// with the admin session and the database replaced by fakes. Only a
// platform owner past the admin second step can give owner access, and
// only for the email they saw: the grant carries it, and a login whose
// email has changed since is refused.
const auth = vi.hoisted(() => ({ state: "none" as "none" | "admin" | "owner" }));
const calls = vi.hoisted(() => ({ granted: [] as Array<{ staffId: number; email: string; founderUserId: string }>, fail: "" }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminApi: vi.fn(async () =>
    auth.state === "none"
      ? { ok: false, response: NextResponse.json({ error: "Two-step verification required." }, { status: 403 }) }
      : { ok: true, session: { userId: "00000000-0000-4000-8000-000000000001", platformRole: auth.state === "owner" ? "platform_owner" : "platform_admin" } },
  ),
}));
vi.mock("@/lib/auth/guards", () => ({
  hasPlatformRole: (session: { platformRole: string }, min: string) => (min === "platform_owner" ? session.platformRole === "platform_owner" : true),
}));
vi.mock("@/db/futprepOwner", () => ({
  grantFutprepOwner: vi.fn(async (input: { staffId: number; email: string; founderUserId: string }) => {
    if (calls.fail) throw new Error(calls.fail);
    calls.granted.push(input);
    return { state: "granted", name: "TEST Owner", email: input.email };
  }),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/admin/futprep-owner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const SEEN = { staffId: 40, email: "test-owner@example.com" };

beforeEach(() => {
  auth.state = "none";
  calls.granted = [];
  calls.fail = "";
});

describe("a founder gives Futprep's owner access", () => {
  it("refuses anyone who hasn't passed the admin second step, and a platform admin who isn't a founder", async () => {
    expect((await post(SEEN)).status).toBe(403);
    auth.state = "admin";
    expect((await post(SEEN)).status).toBe(403);
    expect(calls.granted).toEqual([]);
  });

  it("a founder's grant carries the email they saw and who gave it", async () => {
    auth.state = "owner";
    const response = await post(SEEN);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: "granted" });
    expect(calls.granted).toEqual([{ staffId: 40, email: "test-owner@example.com", founderUserId: "00000000-0000-4000-8000-000000000001" }]);
  });

  it("refuses a grant with no email, or for a login whose email changed since the page loaded", async () => {
    auth.state = "owner";
    expect((await post({ staffId: 40 })).status).toBe(400);
    expect((await post({ staffId: 40, email: "" })).status).toBe(400);
    calls.fail = "EMAIL_CHANGED";
    const changed = await post(SEEN);
    expect(changed.status).toBe(409);
    expect((await changed.json()).error).toMatch(/changed/);
    expect(calls.granted).toEqual([]);
  });

  it("says why it refused", async () => {
    auth.state = "owner";
    for (const [fail, status] of [["NOT_MARKED", 409], ["NOT_A_CEO", 400], ["NO_SIGN_IN", 409], ["ALREADY_MEMBER", 409]] as const) {
      calls.fail = fail;
      expect((await post(SEEN)).status).toBe(status);
    }
    calls.fail = "";
    expect((await post({ ...SEEN, userId: "x" })).status).toBe(400);
    expect((await post({ ...SEEN, staffId: 0 })).status).toBe(400);
    expect(calls.granted).toEqual([]);
  });
});
