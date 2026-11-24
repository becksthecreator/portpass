import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { FUTPREP_FORM_PATHS, FUTPREP_FORMS_ON_PORTPASS, FUTPREP_PUBLIC_PATHS, FUTPREP_REDIRECTED_PATHS, FUTPREP_SITE, publicFutprepWriteAllowed } from "./futprepOffSite";

// A host that takes no new request, so only the return token can open it.
const PREVIEW = "portpass-git-x-port-pass.vercel.app";

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

  it("takes a new registration or private-session request on register.futprep.com and, for now, portpassbahamas.com", () => {
    expect(FUTPREP_FORMS_ON_PORTPASS).toBe(true);
    expect(publicFutprepWriteAllowed("portpassbahamas.com")).toBe(true);
    expect(publicFutprepWriteAllowed("www.portpassbahamas.com")).toBe(true);
    expect(publicFutprepWriteAllowed("PortPassBahamas.com:443")).toBe(true);
    // Previews share the live database: still closed there, and anywhere else.
    expect(publicFutprepWriteAllowed("portpass-git-x-port-pass.vercel.app")).toBe(false);
    expect(publicFutprepWriteAllowed("portpassbahamas.com.evil.example")).toBe(false);
    expect(publicFutprepWriteAllowed("bahamasweddingsbythesea.com")).toBe(false);
    expect(publicFutprepWriteAllowed("register.futprep.com")).toBe(true);
    expect(publicFutprepWriteAllowed("Register.Futprep.com:443")).toBe(true);
  });

  it("still finishes a returning family's registration on PortPass, with its token", () => {
    expect(publicFutprepWriteAllowed(PREVIEW, { returnToken: "abc" })).toBe(true);
    expect(publicFutprepWriteAllowed(PREVIEW, { returnToken: "  " })).toBe(false);
    expect(publicFutprepWriteAllowed(PREVIEW, { returnToken: 7 })).toBe(false);
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

  it("keeps the four form pages on PortPass while the switch is on, and still sends the info pages away", async () => {
    const rules = (await nextConfig.redirects!()) as Array<{ source: string; destination: string }>;
    for (const path of FUTPREP_FORM_PATHS) {
      expect(FUTPREP_REDIRECTED_PATHS).not.toContain(path);
      expect(rules.some((r) => r.source === path && r.destination === FUTPREP_SITE)).toBe(false);
    }
    for (const path of ["/sports-fitness/futprep-athletics", "/futprep", "/futprep/coaches"]) {
      expect(FUTPREP_REDIRECTED_PATHS).toContain(path);
    }
  });

  it("comes first among the redirects, on portpassbahamas.com only, and not permanent", async () => {
    const rules = (await nextConfig.redirects!()) as Array<{ source: string; destination: string; permanent: boolean; has?: Array<{ type: string; value?: string }> }>;
    const first = rules.slice(0, FUTPREP_REDIRECTED_PATHS.length);
    expect(first.map((r) => r.source)).toEqual([...FUTPREP_REDIRECTED_PATHS]);
    for (const rule of first) {
      expect(rule.destination).toBe(FUTPREP_FORM_PATHS.includes(rule.source as never) ? `https://register.futprep.com${rule.source}` : FUTPREP_SITE);
      expect(rule.permanent).toBe(false);
      expect(rule.has?.[0]?.value).toBe("^(www\\.)?portpassbahamas\\.com$");
    }
    expect(rules.some((r) => r.source.startsWith("/futprep/staff") && r.destination === FUTPREP_SITE)).toBe(false);
  });
});
