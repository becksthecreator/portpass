import { describe, expect, it } from "vitest";
import { productJsonLd, jsonLdString } from "@/lib/seo/jsonLd";
import { cleanPage, cleanQuery, MARKET_PAGE_SIZE, marketHref, pageCount, pageRange, parseMarketParams, productHref } from "./browse";

describe("the search box", () => {
  it("keeps words and the marks names use, and nothing that could change a filter", () => {
    expect(cleanQuery("  island   candles ")).toBe("island candles");
    expect(cleanQuery("Mom & Pop's")).toBe("Mom & Pop's");
    expect(cleanQuery("jerseys,(evil).ilike.*")).toBe("jerseys evil .ilike.");
    expect(cleanQuery("100%*")).toBe("100");
    expect(cleanQuery('a"b\\c:d')).toBe("a b c d");
    expect(cleanQuery("Ñandú")).toBe("Ñandú");
  });

  it("ignores one letter, nothing, and anything that isn't text", () => {
    expect(cleanQuery("a")).toBeNull();
    expect(cleanQuery("   ")).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
    expect(cleanQuery(["two", "values"])).toBeNull();
    expect(cleanQuery("x".repeat(200))?.length).toBe(60);
  });
});

describe("the /market address", () => {
  it("reads the tab, the search, the category or section, the filter and the page", () => {
    expect(parseMarketParams({})).toEqual({ tab: "buy", q: null, category: null, section: null, madeOnly: false, page: 1 });
    expect(parseMarketParams({ q: "candle", cat: "home", page: "2" })).toEqual({ tab: "buy", q: "candle", category: "home", section: null, madeOnly: false, page: 2 });
    expect(parseMarketParams({ tab: "do", cat: "sports-fitness", made: "1" })).toEqual({ tab: "do", q: null, category: null, section: "sports-fitness", madeOnly: true, page: 1 });
    // A Market category on the wrong tab, a made-up one, and bad pages fall back.
    expect(parseMarketParams({ cat: "weapons" }).category).toBeNull();
    expect(parseMarketParams({ tab: "do", cat: "Sports Fitness!" }).section).toBeNull();
    expect(cleanPage("0")).toBe(1);
    expect(cleanPage("-3")).toBe(1);
    expect(cleanPage("99999")).toBe(1);
    expect(cleanPage("7")).toBe(7);
  });

  it("writes the link back, leaving defaults out", () => {
    expect(marketHref({})).toBe("/market");
    expect(marketHref({ tab: "buy", category: "food-drink" })).toBe("/market/food-drink");
    expect(marketHref({ tab: "buy", category: "food-drink", q: "guava", page: 2 })).toBe("/market/food-drink?q=guava&page=2");
    expect(marketHref({ tab: "do", section: "weddings", madeOnly: true, page: 1 })).toBe("/market?tab=do&cat=weddings&made=1");
    expect(marketHref({ tab: "do", q: "Mom & Pop's" })).toBe("/market?tab=do&q=Mom+%26+Pop%27s");
    expect(productHref("island-candles", "guava-candle")).toBe("/market/p/island-candles/guava-candle");
  });

  it("pages twenty-four at a time", () => {
    expect(MARKET_PAGE_SIZE).toBe(24);
    expect(pageRange(1)).toEqual([0, 23]);
    expect(pageRange(3)).toEqual([48, 71]);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
  });
});

describe("a product's structured data", () => {
  const base = { name: "Guava candle", description: "Hand-poured.", path: "/market/p/island-candles/guava-candle", photos: ["https://x.supabase.co/a.jpg", "data:image/svg+xml,<svg/>"], priceCents: 2500, inStock: true, category: "Home", sellerName: "Island Candles", sellerPath: "/shop/island-candles" };

  it("says the product, its BSD price, whether it's in stock and who sells it, nothing invented", () => {
    const ld = productJsonLd(base) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Product");
    expect(ld.image).toEqual(["https://x.supabase.co/a.jpg"]);
    expect(ld.offers).toMatchObject({ price: "25.00", priceCurrency: "BSD", availability: "https://schema.org/InStock", url: "https://portpassbahamas.com/market/p/island-candles/guava-candle", seller: { name: "Island Candles", url: "https://portpassbahamas.com/shop/island-candles" } });
    expect(ld).not.toHaveProperty("aggregateRating");
    expect((productJsonLd({ ...base, inStock: false }) as { offers: { availability: string } }).offers.availability).toBe("https://schema.org/OutOfStock");
    expect(productJsonLd({ ...base, description: "" })).not.toHaveProperty("description");
  });

  it("can't be closed early by what a seller typed", () => {
    expect(jsonLdString(productJsonLd({ ...base, name: "</script><script>alert(1)</script>" }))).not.toContain("</script>");
  });
});
