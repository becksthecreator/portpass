import { describe, expect, it } from "vitest";
import { isShopOwnPath, shopAttributionCookie, shopSlugFromPath, attributionFromRequest } from "@/lib/attribution";
import { parseDropInput, parseProductInput, parseShopInput, shopErrorMessage } from "./input";

describe("shop settings", () => {
  it("needs a two-to-four letter prefix and a returns policy before opening", () => {
    expect(parseShopInput({ referencePrefix: "kl", returnsPolicy: "", holdHours: 48, isPublished: false })).toEqual({ ok: true, value: { referencePrefix: "KL", returnsPolicy: "", holdHours: 48, isPublished: false } });
    expect(parseShopInput({ referencePrefix: "K", returnsPolicy: "x", holdHours: 48, isPublished: false }).ok).toBe(false);
    expect(parseShopInput({ referencePrefix: "KL", returnsPolicy: "", holdHours: 48, isPublished: true }).ok).toBe(false);
    expect(parseShopInput({ referencePrefix: "KL", returnsPolicy: "x", holdHours: 0, isPublished: false }).ok).toBe(false);
  });
});

describe("products", () => {
  const base = { title: "Home jersey", description: "Breathable", priceCents: 6500, photos: ["https://x.supabase.co/a.jpg", "javascript:alert(1)"], variants: [{ label: "M", stock: "3" }, { label: "L", stock: "" }] };

  it("keeps sizes with stock or unlimited, and only http(s) photos", () => {
    const parsed = parseProductInput(base);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.variants).toEqual([{ id: null, label: "M", stock: 3 }, { id: null, label: "L", stock: null }]);
      expect(parsed.value.photos).toEqual(["https://x.supabase.co/a.jpg"]);
      expect(parsed.value.usesMarks).toBe(false);
    }
  });

  it("refuses a duplicate size, a negative stock and a price under $1", () => {
    expect(parseProductInput({ ...base, variants: [{ label: "M" }, { label: "m" }] }).ok).toBe(false);
    expect(parseProductInput({ ...base, variants: [{ label: "M", stock: -1 }] }).ok).toBe(false);
    expect(parseProductInput({ ...base, priceCents: 50 }).ok).toBe(false);
  });

  it("asks for the licence kind and note when the product uses another organisation's marks", () => {
    expect(parseProductInput({ ...base, usesMarks: true }).ok).toBe(false);
    expect(parseProductInput({ ...base, usesMarks: true, licenceKind: "fan_edition" }).ok).toBe(false);
    const parsed = parseProductInput({ ...base, usesMarks: true, licenceKind: "official_licensed", licenceNote: "Licence from the federation, 1 Oct" });
    expect(parsed.ok && parsed.value.licenceKind).toBe("official_licensed");
  });
});

describe("drops", () => {
  const base = { title: "Independence drop", opensAt: "2026-10-10T18:00", readyOn: "2026-10-18", allowPickup: true, status: "published", productIds: [1, "2", -3] };

  it("reads Nassau wall-clock times and keeps only real product ids", () => {
    const parsed = parseDropInput(base);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.opensAt).toBe("2026-10-10T22:00:00.000Z");
      expect(parsed.value.productIds).toEqual([1, 2]);
      expect(parsed.value.followersFirstUntil).toBeNull();
    }
  });

  it("needs the pickup or delivery date to publish", () => {
    expect(parseDropInput({ ...base, readyOn: "" }).ok).toBe(false);
    expect(parseDropInput({ ...base, readyOn: "", status: "draft" }).ok).toBe(true);
  });

  it("opens to everyone only after the followers' link", () => {
    expect(parseDropInput({ ...base, followersFirst: true, followersFirstUntil: "2026-10-10T17:00" }).ok).toBe(false);
    const parsed = parseDropInput({ ...base, followersFirst: true, followersFirstUntil: "2026-10-11T18:00" });
    expect(parsed.ok && parsed.value.followersFirstUntil).toBe("2026-10-11T22:00:00.000Z");
  });

  it("needs delivery areas to deliver", () => {
    expect(parseDropInput({ ...base, allowDelivery: true }).ok).toBe(false);
    const parsed = parseDropInput({ ...base, allowDelivery: true, deliveryZones: [" Nassau East ", "Nassau East", ""] });
    expect(parsed.ok && parsed.value.deliveryZones).toEqual(["Nassau East"]);
    expect(parseDropInput({ ...base, allowPickup: false }).ok).toBe(false);
  });

  it("explains the data-rule errors", () => {
    expect(shopErrorMessage(new Error("VARIANT_IN_USE:M"))).toContain("Someone has reserved M");
    expect(shopErrorMessage(new Error("NEEDS_PRODUCTS"))).toContain("published product");
    expect(shopErrorMessage(new Error("something else"))).toBeNull();
  });
});

describe("shop attribution cookie", () => {
  it("is per shop, and moving around one shop is not 'found on PortPass'", () => {
    expect(shopSlugFromPath("/shop/kit-labs/drop/independence")).toBe("kit-labs");
    expect(shopSlugFromPath("/shop")).toBeNull();
    expect(shopSlugFromPath("/shopping")).toBeNull();
    expect(shopAttributionCookie("kit-labs")).toBe("pp_shop_kit-labs");
    const own = isShopOwnPath("kit-labs");
    const fromShop = attributionFromRequest({ searchParams: new URLSearchParams(), referer: "https://portpassbahamas.com/shop/kit-labs", ownHost: "portpassbahamas.com", isOwnPath: own });
    expect(fromShop).toBeNull();
    const fromSection = attributionFromRequest({ searchParams: new URLSearchParams(), referer: "https://portpassbahamas.com/shop", ownHost: "portpassbahamas.com", isOwnPath: own });
    expect(fromSection?.viaPortpass).toBe(true);
  });
});
