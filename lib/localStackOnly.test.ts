import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertLocalSupabase } from "./localStackOnly.mjs";

// Audit finding 7 (PR #198): the integration tests, the TEST seed and the
// scripts write with the secret key to wherever SUPABASE_URL points, so
// they refuse anything but a local Supabase stack. The check is on the
// address's host, not a substring, so a real project cannot pass by having
// "localhost" somewhere in its address.
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

  // Every script under scripts/ that reads the Supabase address or the
  // secret key, found by walking the folder, so a new script is held to
  // the same rule without being added here.
  const scripts = readdirSync("scripts", { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|mts|mjs|js|cjs)$/.test(file))
    .map((file) => join("scripts", file))
    .filter((file) => /SUPABASE_(URL|SECRET_KEY)/.test(readFileSync(file, "utf8")));

  it("finds the seeds, the end-to-end runs and the screenshot and motion scripts", () => {
    expect(scripts).toEqual(
      expect.arrayContaining([
        join("scripts", "seed-test-data.ts"),
        join("scripts", "e2e", "phase1-run.mjs"),
        join("scripts", "screenshots", "seed-staff-fixture.ts"),
        join("scripts", "motion", "check.mjs"),
      ]),
    );
  });

  it.each(["vitest.integration.setup.ts", ...scripts])("is called by %s before it makes a Supabase client", (file) => {
    const source = readFileSync(file, "utf8");
    // The shared guard, by its .mjs path: plain node cannot import a .ts
    // file, and a copy of the rule in the script could drift.
    expect(source).toMatch(/from "(\.\/|(\.\.\/)+)lib\/localStackOnly\.mjs"/);
    expect(source).not.toMatch(/includes\("(127\.0\.0\.1|localhost)"\)/);
    const guard = source.indexOf("assertLocalSupabase()");
    expect(guard).toBeGreaterThan(-1);
    const firstClient = source.indexOf("createClient(");
    if (firstClient !== -1) expect(guard).toBeLessThan(firstClient);
  });
});
