import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { FUTPREP_PUBLIC_PATHS, FUTPREP_SITE, publicFutprepWriteAllowed } from "./futprepOffSite";

describe("Futprep off PortPass's public pages (19 Nov 2026)", () => {
  it("sends the public pages to Futprep's own site", () => {
    expect(FUTPREP_SITE).toBe("https://www.futprep.com/");
    for (const path of ["/sports-fitness/futprep-athletics", "/sports-fitness/futprep-athletics/:path*", "/futprep", "/futprep/register", "/futprep/camps", "/futprep/trial", "/futprep/book"]) {
      expect(FUTPREP_PUBLIC_PATHS).toContain(path);
    }
  });

  it("keeps a returning family's own link: /futprep/register/return/<token> is not redirected", () => {
    expect(FUTPREP_PUBLIC_PATHS.some((p) => p.startsWith("/futprep/register/"))).toBe(false);
  });

  it("takes a new registration or private-session request only on register.futprep.com", () => {
    expect(publicFutprepWriteAllowed("portpassbahamas.com")).toBe(false);
    expect(publicFutprepWriteAllowed("www.portpassbahamas.com")).toBe(false);
    expect(publicFutprepWriteAllowed("portpass-git-x-port-pass.vercel.app")).toBe(false);
    expect(publicFutprepWriteAllowed("register.futprep.com")).toBe(true);
    expect(publicFutprepWriteAllowed("Register.Futprep.com:443")).toBe(true);
  });

  it("still finishes a returning family's registration on PortPass, with its token", () => {
    expect(publicFutprepWriteAllowed("portpassbahamas.com", { returnToken: "abc" })).toBe(true);
    expect(publicFutprepWriteAllowed("portpassbahamas.com", { returnToken: "  " })).toBe(false);
    expect(publicFutprepWriteAllowed("portpassbahamas.com", { returnToken: 7 })).toBe(false);
  });

  it("stays open on a local stack, so Futprep's tests and end-to-end runs still register TEST families (rule 9)", () => {
    expect(publicFutprepWriteAllowed(null)).toBe(true);
    expect(publicFutprepWriteAllowed("localhost:3000")).toBe(true);
    expect(publicFutprepWriteAllowed("127.0.0.1:3000")).toBe(true);
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
