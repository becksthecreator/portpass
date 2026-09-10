import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAdminToken, PORTPASS_ADMIN_COOKIE } from "./admin-auth";
import { currentPortpassAdmin, requirePortpassAdmin } from "./admin-session";

// currentPortpassAdmin/requirePortpassAdmin read next/headers' cookies() and
// call next/navigation's redirect() - both require an active Next.js request
// scope that doesn't exist under plain Vitest, so we mock them the way the
// real implementations behave: cookies() returns whatever this test set as
// the "incoming" cookie, and redirect() throws the same NEXT_REDIRECT-shaped
// error Next itself throws, so a redirect shows up as a specific rejection
// rather than a silent pass-through.
let cookieValue: string | undefined;

// server-only's guard checks `typeof window`, which is fine under Vitest's
// node environment - but mock it explicitly so this test doesn't depend on
// that detail holding across versions.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === PORTPASS_ADMIN_COOKIE && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    (error as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  },
}));

const ORIGINAL_PIN = process.env.PORTPASS_ADMIN_PIN;

describe("admin session guards", () => {
  beforeEach(() => {
    process.env.PORTPASS_ADMIN_PIN = "4242";
    cookieValue = undefined;
  });

  afterEach(() => {
    if (ORIGINAL_PIN === undefined) delete process.env.PORTPASS_ADMIN_PIN;
    else process.env.PORTPASS_ADMIN_PIN = ORIGINAL_PIN;
  });

  it("currentPortpassAdmin is false with no cookie at all", async () => {
    expect(await currentPortpassAdmin()).toBe(false);
  });

  it("currentPortpassAdmin is true with a validly signed cookie", async () => {
    cookieValue = (await makeAdminToken("4242"))!;
    expect(await currentPortpassAdmin()).toBe(true);
  });

  it("currentPortpassAdmin is false with a garbage cookie", async () => {
    cookieValue = "not-a-real-token";
    expect(await currentPortpassAdmin()).toBe(false);
  });

  it("requirePortpassAdmin redirects to /admin/login when unauthenticated", async () => {
    await expect(requirePortpassAdmin("/organizations/1")).rejects.toMatchObject({
      digest: expect.stringContaining("/admin/login"),
    });
  });

  it("requirePortpassAdmin does not throw when authenticated", async () => {
    cookieValue = (await makeAdminToken("4242"))!;
    await expect(requirePortpassAdmin("/organizations/1")).resolves.toBeUndefined();
  });
});
