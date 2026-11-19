import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { FUTPREP_PUBLIC_PATHS, FUTPREP_SITE } from "./futprepOffSite";

describe("Futprep off PortPass's public pages (19 Nov 2026)", () => {
  it("sends the public pages to Futprep's own site", () => {
    expect(FUTPREP_SITE).toBe("https://www.futprep.com/");
    for (const path of ["/sports-fitness/futprep-athletics", "/sports-fitness/futprep-athletics/:path*", "/futprep", "/futprep/register", "/futprep/register/:path*", "/futprep/camps", "/futprep/trial", "/futprep/book"]) {
      expect(FUTPREP_PUBLIC_PATHS).toContain(path);
    }
  });

  it("never sends staff, families' lookup, the owner dashboard or an API there (rule 9)", () => {
    for (const path of FUTPREP_PUBLIC_PATHS) {
      expect(path).not.toMatch(/^\/futprep\/(staff|my|feed)|^\/api\/|^\/business\//);
    }
  });

  it("comes first among the redirects, on portpassbahamas.com only, and not permanent", async () => {
    const rules = (await nextConfig.redirects!()) as Array<{ source: string; destination: string; permanent: boolean; has?: Array<{ type: string; value?: string }> }>;
    const first = rules.slice(0, FUTPREP_PUBLIC_PATHS.length);
    expect(first.map((r) => r.source)).toEqual([...FUTPREP_PUBLIC_PATHS]);
    for (const rule of first) {
      expect(rule.destination).toBe(FUTPREP_SITE);
      expect(rule.permanent).toBe(false);
      expect(rule.has?.[0]?.value).toBe("^(www\\.)?portpassbahamas\\.com$");
    }
    expect(rules.some((r) => r.source.startsWith("/futprep/staff") && r.destination === FUTPREP_SITE)).toBe(false);
  });
});
