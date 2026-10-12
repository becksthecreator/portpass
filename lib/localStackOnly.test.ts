import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertLocalSupabase } from "./localStackOnly";

// Audit finding 7 (PR #198): the integration tests and the TEST seed write
// with the secret key to wherever SUPABASE_URL points, so they refuse
// anything but a local Supabase stack. The check is on the address's host,
// not a substring, so a real project cannot pass by having "localhost"
// somewhere in its address.
describe("the local-stack guard", () => {
  it("lets a local Supabase stack through", () => {
    expect(() => assertLocalSupabase("http://127.0.0.1:54321")).not.toThrow();
    expect(() => assertLocalSupabase("http://localhost:54321")).not.toThrow();
  });

  it.each([
    ["a hosted project", "https://abcdefghijklmnop.supabase.co"],
    ["localhost as a subdomain", "https://localhost.example.com"],
    ["localhost in the query", "https://abcdefghijklmnop.supabase.co/?localhost"],
    ["127.0.0.1 in the path", "https://abcdefghijklmnop.supabase.co/127.0.0.1"],
    ["localhost as the user name", "http://localhost@abcdefghijklmnop.supabase.co"],
    ["127.0.0.1 as a subdomain", "http://127.0.0.1.nip.io:54321"],
    ["nothing at all", undefined],
    ["an empty value", ""],
    ["an address with no scheme", "127.0.0.1:54321"],
  ])("refuses %s, and never repeats the address", (_label, url) => {
    let message = "";
    try {
      assertLocalSupabase(url);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/SUPABASE_URL/);
    if (url) expect(message).not.toContain(url);
  });

  it("reads SUPABASE_URL when no address is given", () => {
    const before = process.env.SUPABASE_URL;
    try {
      process.env.SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
      expect(() => assertLocalSupabase()).toThrow(/SUPABASE_URL/);
      process.env.SUPABASE_URL = "http://127.0.0.1:54321";
      expect(() => assertLocalSupabase()).not.toThrow();
    } finally {
      if (before === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = before;
    }
  });

  it.each(["vitest.integration.setup.ts", "scripts/seed-test-data.ts"])("is called by %s before it touches the database", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toMatch(/assertLocalSupabase\(\)/);
    const guard = source.indexOf("assertLocalSupabase()");
    const firstClient = source.indexOf("createClient(");
    if (firstClient !== -1) expect(guard).toBeLessThan(firstClient);
  });
});
