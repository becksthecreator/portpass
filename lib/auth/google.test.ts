import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleSignInEnabled } from "./google";

// The "Continue with Google" button only shows once Google is switched on
// in Supabase Auth; before that it led to Supabase's own error page.
describe("googleSignInEnabled", () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  });
  afterEach(() => {
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
  });

  function answering(body: unknown, status = 200) {
    return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  }

  it("is on only when Supabase says the Google provider is enabled", async () => {
    const on = answering({ external: { google: true, email: true } });
    expect(await googleSignInEnabled(on)).toBe(true);
    expect(on).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/settings", expect.objectContaining({ headers: { apikey: "test-publishable-key" } }));
    expect(await googleSignInEnabled(answering({ external: { google: false, email: true } }))).toBe(false);
    expect(await googleSignInEnabled(answering({ external: { email: true } }))).toBe(false);
  });

  it("is off when Supabase can't be asked", async () => {
    expect(await googleSignInEnabled(answering({ message: "no" }, 500))).toBe(false);
    expect(await googleSignInEnabled(answering(null))).toBe(false);
    const failing = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await googleSignInEnabled(failing)).toBe(false);
    delete process.env.SUPABASE_URL;
    expect(await googleSignInEnabled(answering({ external: { google: true } }))).toBe(false);
  });
});
