import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FUTPREP_REDIRECTED_PATHS } from "./futprepOffSite";

// The Futprep pages still on PortPass (the forms, the family lookup, class
// updates, the staff screens) link to futprep.com directly, never to an
// address that next.config.ts redirects there. A <Link> to one is fetched in
// the background, futprep.com refuses that request, and the browser logs an
// error: that cost /futprep/register its Lighthouse best-practices score
// (0.93, 24 Nov). /futprep/coaches is itself redirected, so its own files
// don't count.
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path.replace(/\\/g, "/") === "app/futprep/coaches" ? [] : walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("Futprep pages on PortPass link out directly (24 Nov)", () => {
  it("no page links to an address that redirects to futprep.com", () => {
    const exact = FUTPREP_REDIRECTED_PATHS.filter((p) => !p.includes(":"));
    // "/x/:path*" redirects everything under /x too.
    const under = FUTPREP_REDIRECTED_PATHS.filter((p) => p.endsWith("/:path*")).map((p) => p.slice(0, -"/:path*".length));
    const esc = (path: string) => path.replace(/[/-]/g, (c) => `\\${c}`);
    // A quoted address, relative or on portpassbahamas.com, or the start of one built in a template.
    const start = `["'\`](?:https?:\\/\\/(?:www\\.)?portpassbahamas\\.com)?`;
    const patterns = [
      ...exact.map((path) => ({ path, re: new RegExp(`${start}${esc(path)}(["'\`?#]|\\/\\$\\{)`) })),
      ...under.map((path) => ({ path: `${path}/…`, re: new RegExp(`${start}${esc(path)}\\/[a-z0-9$]`) })),
    ];
    const offenders: string[] = [];
    for (const file of walk("app/futprep")) {
      const code = readFileSync(file, "utf8");
      for (const { path, re } of patterns) {
        if (re.test(code)) offenders.push(`${file.replace(/\\/g, "/")}: ${path}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
