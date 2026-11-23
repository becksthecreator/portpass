import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// The business card's QR code prints portpassbahamas.com/card (23 Nov 2026).
// The printed address never changes; this redirect decides where it lands.
describe("/card, the business card's QR code", () => {
  it("is a temporary redirect to the free First Look request, tagged as a card scan", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    const card = rules.find((rule) => rule.source === "/card");
    expect(card).toBeDefined();
    expect(card?.destination).toBe("/apply?utm_source=card&utm_medium=qr");
    // Temporary, so the target can change later without a reprint and no
    // browser or cache keeps the old one.
    expect(card && "permanent" in card ? card.permanent : undefined).toBe(false);
  });

  it("applies on PortPass's own hosts and previews, never on a business's own domain", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    const host = rules.find((rule) => rule.source === "/card")?.has?.find((h) => h.type === "host");
    const pattern = new RegExp(String(host?.value));
    for (const ok of ["portpassbahamas.com", "www.portpassbahamas.com", "portpass-git-fix-card-port-pass.vercel.app"]) expect(pattern.test(ok)).toBe(true);
    for (const no of ["bahamasweddingsbythesea.com", "register.futprep.com", "portpassbahamas.com.evil.example"]) expect(pattern.test(no)).toBe(false);
  });

  it("is the only rule for /card", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules.filter((rule) => rule.source === "/card")).toHaveLength(1);
  });
});
