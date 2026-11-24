import { describe, expect, it } from "vitest";
import { onPortPassHost } from "./PwaRegister";

describe("the PortPass app banner's hosts", () => {
  it("shows on PortPass's own hosts, previews and local dev", () => {
    for (const host of ["portpassbahamas.com", "www.portpassbahamas.com", "portpass-git-x-port-pass.vercel.app", "localhost"]) {
      expect(onPortPassHost(host)).toBe(true);
    }
  });

  it("never shows on a business's own domain, or a lookalike", () => {
    for (const host of ["bahamasweddingsbythesea.com", "www.bahamasweddingsbythesea.com", "portpassbahamas.com.evil.example", "notportpassbahamas.com"]) {
      expect(onPortPassHost(host)).toBe(false);
    }
  });
});
