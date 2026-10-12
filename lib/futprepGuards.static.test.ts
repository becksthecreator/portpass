import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Brief 31 (security review): every Futprep staff page and route checks
// who is signed in before it does anything. lib/auth/guards.static.test.ts
// covers PortPass's own areas; Futprep's staff screens sign in by PIN and
// use their own checks, listed here. A new page or route that uses none of
// them fails this test.
const GUARD = /\b(requireFutprepStaff|currentFutprepStaffRole|currentFutprepStaffAccount|currentInboxViewer|resolvePayAccess|passportAccess|futprepPaymentsAccess|requireManager)\s*\(/;

// Each with the reason it has no staff check of its own.
const OPEN = new Map<string, string>([
  ["app/futprep/staff/login/page.tsx", "the PIN sign-in page itself"],
  ["app/api/futprep/staff/session/route.ts", "the PIN sign-in itself (rate-limited and locked after five wrong PINs)"],
  ["app/api/futprep/staff/bootstrap-admin/route.ts", "the first-admin door, shut once any login exists (brief 21 and #204)"],
  ["app/api/futprep/availability/route.ts", "the open times parents pick from: dates and times only"],
  ["app/api/futprep/private-sessions/route.ts", "the parents' request form (rate-limited, checked by zod)"],
  ["app/api/futprep/registrations/route.ts", "the public registration form (rate-limited)"],
  ["app/api/futprep/registrations/lookup/route.ts", "the families' lookup by reference and date of birth (rate-limited)"],
  ["app/api/futprep/registrations/[code]/complete/route.ts", "a family's own completion link"],
]);

// A guard named only in a comment doesn't count.
function code(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [...walk(join(process.cwd(), "app/futprep/staff")), ...walk(join(process.cwd(), "app/api/futprep"))]
  .filter((f) => /(^|[\\/])(page\.tsx|route\.ts)$/.test(f))
  .map((f) => relative(process.cwd(), f).replace(/\\/g, "/"));

describe("Futprep staff pages and routes check the login (brief 31)", () => {
  it("finds the files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("every one calls a staff check, unless it is one of the open doors", () => {
    const missing = files.filter((file) => !OPEN.has(file) && !GUARD.test(code(file)));
    expect(missing).toEqual([]);
  });

  it("the open doors are still there, so this list can't go stale", () => {
    for (const file of OPEN.keys()) expect(files).toContain(file);
  });
});
