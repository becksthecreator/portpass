import { describe, expect, it } from "vitest";
import { CHECKLIST_KEYS, checklistSummary, missingItems, pageChecklist, type PageFacts } from "./pageChecklist";

const complete: PageFacts = {
  slug: "island-booth",
  hasHero: true,
  photos: 6,
  pricedOfferings: 3,
  openOfferings: 3,
  openProgrammes: 0,
  hasWhatsApp: true,
  hasInstagram: true,
  hasGoogleBusiness: true,
  getPaidDone: true,
  livePerks: 1,
};
const empty: PageFacts = { slug: "new-business", hasHero: false, photos: 0, pricedOfferings: 0, openOfferings: 0, openProgrammes: 0, hasWhatsApp: false, hasInstagram: false, hasGoogleBusiness: false, getPaidDone: false, livePerks: 0 };
const keysMissing = (facts: PageFacts) => missingItems(pageChecklist(facts)).map((item) => item.key);

describe("what a page is missing", () => {
  it("lists the nine things in the brief's order, each with somewhere to fix it", () => {
    const items = pageChecklist(empty);
    expect(items.map((item) => item.key)).toEqual([...CHECKLIST_KEYS]);
    expect(items).toHaveLength(9);
    for (const item of items) {
      expect(item.href.startsWith("/business/new-business/"), item.key).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
      expect(item.action.length).toBeGreaterThan(0);
    }
  });

  it("a finished page is missing nothing; a new one is missing everything", () => {
    expect(keysMissing(complete)).toEqual([]);
    expect(checklistSummary(pageChecklist(complete))).toBe("Nothing missing");
    expect(keysMissing(empty)).toEqual([...CHECKLIST_KEYS]);
    expect(checklistSummary(pageChecklist(empty))).toBe("9 things to add");
    expect(checklistSummary(pageChecklist({ ...complete, hasInstagram: false }))).toBe("1 thing to add");
  });

  it("sends each item to the step where it is fixed", () => {
    const href = Object.fromEntries(pageChecklist(empty).map((item) => [item.key, item.href]));
    expect(href).toEqual({
      hero: "/business/new-business/settings?step=3",
      photos: "/business/new-business/settings?step=3",
      price: "/business/new-business/settings?step=4",
      whatsapp: "/business/new-business/settings?step=2",
      instagram: "/business/new-business/settings?step=2",
      get_paid: "/business/new-business/settings?step=5",
      perk: "/business/new-business/perks",
      google: "/business/new-business/settings?step=2",
      open: "/business/new-business/settings?step=4",
    });
  });

  it("wants five photos, and says how many more", () => {
    const photos = (n: number) => pageChecklist({ ...complete, photos: n }).find((item) => item.key === "photos")!;
    expect(photos(5).done).toBe(true);
    expect(photos(4)).toMatchObject({ done: false, detail: "4 so far. Add 1 more to reach 5." });
    expect(photos(0).detail).toContain("Add 5 photos");
  });

  it("something is open when a priced offering is published or a class is open for registration", () => {
    const open = (over: Partial<PageFacts>) => pageChecklist({ ...complete, ...over }).find((item) => item.key === "open")!;
    expect(open({ openOfferings: 0, openProgrammes: 0 }).done).toBe(false);
    expect(open({ openOfferings: 0, openProgrammes: 2 })).toMatchObject({ done: true, detail: "2 classes or camps are open for registration." });
    expect(open({ openOfferings: 1, openProgrammes: 0 })).toMatchObject({ done: true, detail: "1 priced offering is published." });
    expect(open({ openOfferings: 6, openProgrammes: 4 }).detail).toBe("4 classes or camps are open for registration, 6 priced offerings are published.");
  });

  // What the brief says is true on 5 Oct 2026, from the live data that day.
  it("matches what the three businesses were missing on 5 October", () => {
    const futprep: PageFacts = { slug: "futprep", hasHero: true, photos: 4, pricedOfferings: 8, openOfferings: 6, openProgrammes: 4, hasWhatsApp: false, hasInstagram: false, hasGoogleBusiness: false, getPaidDone: true, livePerks: 0 };
    const weddings: PageFacts = { slug: "bahamas-weddings", hasHero: true, photos: 6, pricedOfferings: 4, openOfferings: 4, openProgrammes: 0, hasWhatsApp: true, hasInstagram: false, hasGoogleBusiness: false, getPaidDone: false, livePerks: 0 };
    const carv: PageFacts = { slug: "carv-performance", hasHero: false, photos: 0, pricedOfferings: 6, openOfferings: 6, openProgrammes: 0, hasWhatsApp: false, hasInstagram: true, hasGoogleBusiness: false, getPaidDone: false, livePerks: 0 };
    expect(keysMissing(futprep)).toEqual(["photos", "whatsapp", "instagram", "perk", "google"]);
    expect(keysMissing(weddings)).toEqual(["instagram", "get_paid", "perk", "google"]);
    expect(keysMissing(carv)).toEqual(["hero", "photos", "whatsapp", "get_paid", "perk", "google"]);
  });
});
