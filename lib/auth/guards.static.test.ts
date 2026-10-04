import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Fails the build if a protected surface ships without a guard. Every
// route handler and page under these roots must call one of the
// lib/auth/guards.ts helpers in the same file (a layout's guard doesn't
// protect a handler). A file that is public on purpose says so with a
// pragma in its first five lines, and the pragma list below must match --
// so nothing can quietly be public without appearing here.
const ROOTS = ["app/api/account", "app/api/business", "app/api/admin", "app/api/payments", "app/api/demo", "app/account", "app/business", "app/where-to", "app/admin", "app/organizations", "app/demo"];

const PUBLIC_ROUTES = new Set<string>([
  "app/business/page.tsx", // the "PortPass for business" marketing page
  "app/demo/page.tsx", // the demo's front door: one tap starts a demo session
  "app/demo/start/route.ts", // starts the demo session
  "app/demo/exit/route.ts", // ends it
]);

const HANDLER = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*=/;
const PAGE = /export\s+default\b/;
// paymentsApiAccess (lib/paymentRequests/access.ts, brief 17) is
// requireOrgRoleApi plus the payments permission, or Futprep's staff PIN
// for Futprep's own payments only.
// requireDemo (lib/auth/demo.ts, brief 18 part B) admits a demo session to
// the demo business only; it is the guard of every /demo screen and route.
const GUARD = /\brequire(SignedIn|PlatformRole|OrgRole|Admin|Demo)(Api)?\s*\(|\bpaymentsApiAccess\s*\(/;
const PRAGMA = /^\s*\/\/\s*@public-route:/m;

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function repoPath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

describe("every protected route and page calls an auth guard", () => {
  const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root))).filter((f) => /(^|[\\/])(route\.tsx?|page\.tsx)$/.test(f));

  it("finds the surfaces it is supposed to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = repoPath(file);
    it(rel, () => {
      const source = readFileSync(file, "utf8");
      const isRoute = /route\.tsx?$/.test(file);
      const exportsSomething = isRoute ? HANDLER.test(source) : PAGE.test(source);
      if (!exportsSomething) return;
      const head = source.split("\n").slice(0, 5).join("\n");
      const declaredPublic = PRAGMA.test(head);
      if (declaredPublic) {
        expect(PUBLIC_ROUTES.has(rel), `${rel} carries @public-route but is not in PUBLIC_ROUTES`).toBe(true);
        return;
      }
      expect(PUBLIC_ROUTES.has(rel), `${rel} is listed in PUBLIC_ROUTES but has no @public-route pragma`).toBe(false);
      expect(GUARD.test(source), `${rel} exports a handler/page without calling requireSignedIn/requirePlatformRole/requireOrgRole/requireAdmin`).toBe(true);
    });
  }

  it("has no stale PUBLIC_ROUTES entries", () => {
    const existing = new Set(files.map(repoPath));
    for (const entry of PUBLIC_ROUTES) {
      expect(existing.has(entry), `PUBLIC_ROUTES entry ${entry} no longer exists`).toBe(true);
    }
  });
});
