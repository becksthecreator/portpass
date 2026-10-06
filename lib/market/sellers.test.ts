import { describe, expect, it } from "vitest";
import { isMarketCategory, MARKET_CATEGORIES, marketCategoryName } from "./categories";
import {
  cleanLicenceNumber,
  parseDeliveryZones,
  parseSellerApplication,
  parseSellerProfile,
  prefixCandidates,
  verificationProblems,
  zoneLine,
  zonesFromRow,
  zonesToRow,
} from "./sellers";

describe("Market categories", () => {
  it("are the eight the brief names, each with a slug the database accepts", () => {
    expect(MARKET_CATEGORIES.map((c) => c.name)).toEqual(["Food & Drink", "Kits & Apparel", "Crafts & Gifts", "Home", "Beauty", "Kids", "Events & Party", "Services"]);
    for (const c of MARKET_CATEGORIES) expect(c.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(isMarketCategory("kits-apparel")).toBe(true);
    expect(isMarketCategory("weapons")).toBe(false);
    expect(isMarketCategory(null)).toBe(false);
    expect(marketCategoryName("food-drink")).toBe("Food & Drink");
    expect(marketCategoryName(null)).toBeNull();
  });
});

describe("delivery zones", () => {
  it("keeps a zone, its fee and its notice, and round-trips the database shape", () => {
    const parsed = parseDeliveryZones([{ zone: "  Cable   Beach ", feeCents: 1000, leadDays: 2 }, { zone: "Downtown", feeCents: 0, leadDays: 0 }]);
    expect(parsed).toEqual({ ok: true, value: [{ zone: "Cable Beach", feeCents: 1000, leadDays: 2 }, { zone: "Downtown", feeCents: 0, leadDays: 0 }] });
    if (parsed.ok) expect(zonesFromRow(zonesToRow(parsed.value))).toEqual(parsed.value);
    expect(parseDeliveryZones(undefined)).toEqual({ ok: true, value: [] });
  });

  it("refuses a zone named twice, a fee out of range, a fraction and more than twelve", () => {
    expect(parseDeliveryZones([{ zone: "Cable Beach", feeCents: 0, leadDays: 1 }, { zone: "cable beach", feeCents: 0, leadDays: 1 }]).ok).toBe(false);
    expect(parseDeliveryZones([{ zone: "A", feeCents: -1, leadDays: 1 }]).ok).toBe(false);
    expect(parseDeliveryZones([{ zone: "A", feeCents: 100_001, leadDays: 1 }]).ok).toBe(false);
    expect(parseDeliveryZones([{ zone: "A", feeCents: 10.5, leadDays: 1 }]).ok).toBe(false);
    expect(parseDeliveryZones([{ zone: "A", feeCents: 0, leadDays: 31 }]).ok).toBe(false);
    expect(parseDeliveryZones([{ zone: "", feeCents: 0, leadDays: 1 }]).ok).toBe(false);
    expect(parseDeliveryZones(Array.from({ length: 13 }, (_, i) => ({ zone: `Z${i}`, feeCents: 0, leadDays: 0 }))).ok).toBe(false);
    expect(parseDeliveryZones("Cable Beach").ok).toBe(false);
  });

  it("reads as a buyer would say it", () => {
    expect(zoneLine({ zone: "Cable Beach", feeCents: 1000, leadDays: 2 })).toBe("Cable Beach · $10 · 2 days' notice");
    expect(zoneLine({ zone: "Downtown", feeCents: 0, leadDays: 0 })).toBe("Downtown · free · same day");
    expect(zoneLine({ zone: "Lyford Cay", feeCents: 1250, leadDays: 1 })).toBe("Lyford Cay · $12.50 · 1 day's notice");
  });
});

describe("the business licence number", () => {
  it("is a number as printed, never anything else", () => {
    expect(cleanLicenceNumber(" BL-2026/00417 ")).toBe("BL-2026/00417");
    expect(cleanLicenceNumber("12345")).toBe("12345");
    expect(cleanLicenceNumber("ab")).toBeNull();
    expect(cleanLicenceNumber("<script>")).toBeNull();
    expect(cleanLicenceNumber("https://evil.example/scan.pdf")).toBeNull();
  });
});

describe("applying at /sell", () => {
  const base = { businessName: "TEST Island Candles", category: "home", licenceNumber: "BL-00417", contactPerson: "TEST Person", whatsapp: "242-555-0101", whatTheySell: "Candles.", pickupLocation: "Shirley Street studio", cashOnPickup: true };

  it("takes the brief's fields and normalises the WhatsApp number", () => {
    const parsed = parseSellerApplication(base);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.whatsappE164).toBe("+12425550101");
      expect(parsed.value.marketCategory).toBe("home");
      expect(parsed.value.acceptsCashOnPickup).toBe(true);
    }
  });

  it("refuses an application without a licence number, a contact, a category or a cash answer", () => {
    expect(parseSellerApplication({ ...base, licenceNumber: "" }).ok).toBe(false);
    expect(parseSellerApplication({ ...base, licenceNumber: "x" }).ok).toBe(false);
    expect(parseSellerApplication({ ...base, contactPerson: " " }).ok).toBe(false);
    expect(parseSellerApplication({ ...base, category: "platform" }).ok).toBe(false);
    expect(parseSellerApplication({ ...base, cashOnPickup: "yes" }).ok).toBe(false);
    expect(parseSellerApplication({ ...base, whatsapp: "12" }).ok).toBe(false);
    expect(parseSellerApplication({ ...base, pickupLocation: "" }).ok).toBe(false);
  });
});

describe("the seller's own settings", () => {
  const base = { category: "beauty", whatTheySell: "Soap", contactPerson: "TEST Person", licenceNumber: "BL-1", pickupNote: "Studio", deliveryZones: [], cashOnPickup: false };

  it("saves without asking, and asks only with the records and a way to get the order", () => {
    expect(parseSellerProfile(base).ok).toBe(true);
    expect(parseSellerProfile({ ...base, licenceNumber: "", requestVerification: true }).ok).toBe(false);
    expect(parseSellerProfile({ ...base, contactPerson: "", requestVerification: true }).ok).toBe(false);
    expect(parseSellerProfile({ ...base, pickupNote: "", requestVerification: true }).ok).toBe(false);
    expect(parseSellerProfile({ ...base, pickupNote: "", deliveryZones: [{ zone: "Downtown", feeCents: 500, leadDays: 1 }], requestVerification: true }).ok).toBe(true);
    const asked = parseSellerProfile({ ...base, requestVerification: true });
    expect(asked.ok && asked.value.requestVerification).toBe(true);
  });

  it("lets the category be cleared but not made up", () => {
    const cleared = parseSellerProfile({ ...base, category: "" });
    expect(cleared.ok && cleared.value.marketCategory).toBeNull();
    expect(parseSellerProfile({ ...base, category: "guns" }).ok).toBe(false);
  });

  it("says what is missing in plain words", () => {
    expect(verificationProblems({ licenceNumber: null, contactPerson: null, pickupNote: "", deliveryZones: [] })).toEqual(["add your business licence number", "add a contact person", "say where buyers collect, or where you deliver"]);
    expect(verificationProblems({ licenceNumber: "BL-1", contactPerson: "A", pickupNote: "Studio", deliveryZones: [] })).toEqual([]);
  });
});

describe("reference prefixes for a new shop", () => {
  it("start from the initials and are always two to four capital letters", () => {
    const candidates = prefixCandidates("Kit Labs");
    expect(candidates[0]).toBe("KL");
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const c of candidates) expect(c).toMatch(/^[A-Z]{2,4}$/);
    expect(candidates.length).toBeGreaterThan(50);
  });

  it("copes with a one-word name, digits and symbols", () => {
    expect(prefixCandidates("Bakery")[0]).toBe("BA");
    expect(prefixCandidates("242 Co.")[0]).toBe("CO");
    expect(prefixCandidates("!!!").every((c) => /^[A-Z]{2,4}$/.test(c))).toBe(true);
  });
});
