import { describe, expect, it } from "vitest";
import { cleanGoogleBusinessUrl, isGoogleBusinessUrl, reviewRequestMessage } from "./googleBusiness";
import { businessJsonLd, businessType, FAQ_MINIMUM, homeJsonLd, jsonLdString, ldAddress, priceRange, sectionJsonLd, type LdBusiness } from "./jsonLd";
import { matchCount, matchesQuery, rankMatches, searchTerms } from "./search";
import { businessDescription, businessTitle, DESCRIPTION_MAX, fitDescription, nameList, sectionDescription, sectionTitle } from "./titles";

const booth: LdBusiness = {
  name: "TEST Photo Booth", path: "/entertainment/test-photo-booth", section: "entertainment", subcategory: "photo-booths", description: "Photo booths for parties", area: "Cable Beach", island: "New Providence",
  whatsappE164: "+12425550100", heroImageUrl: "/photos/booth.jpg", logoUrl: null, websiteUrl: "https://example.com", instagramHandle: "@test_booth", googleBusinessUrl: "https://g.page/r/TEST",
};

type Graph = { "@graph": Array<Record<string, unknown>> };

describe("structured data", () => {
  it("says who PortPass is and where its search is, on the homepage", () => {
    const home = homeJsonLd() as Graph;
    const types = home["@graph"].map((node) => node["@type"]);
    expect(types).toEqual(["Organization", "WebSite"]);
    expect(JSON.stringify(home)).toContain("https://portpassbahamas.com/search?q={search_term_string}");
  });

  const faqs = [
    { question: "Do you travel?", answer: "Anywhere on New Providence." },
    { question: "Do you print on the day?", answer: "Yes, unlimited prints." },
    { question: "How much space do you need?", answer: "About ten feet square." },
  ];

  it("describes a business with its address, prices in BSD as the page shows them, links and questions, and never a rating", () => {
    const data = businessJsonLd(
      booth,
      [
        { name: "Two hours", type: "service", summary: "Unlimited prints", priceCents: 30000, priceUnit: null, actionUrl: null },
        { name: "Saturday class", type: "program", summary: null, priceCents: 3500, priceUnit: "per_session", actionUrl: "/futprep/register" },
        { name: "Wedding package", type: "service", summary: null, priceCents: 50000, priceUnit: "from", actionUrl: null },
        { name: "Ask for a price", type: "service", summary: null, priceCents: null, priceUnit: null, actionUrl: null },
      ],
      faqs,
    ) as Graph;
    const business = data["@graph"][0];
    expect(business).toMatchObject({
      "@type": "EntertainmentBusiness",
      name: "TEST Photo Booth",
      url: "https://portpassbahamas.com/entertainment/test-photo-booth",
      telephone: "+12425550100",
      priceRange: "$35–$500",
      address: { addressLocality: "Cable Beach", addressRegion: "New Providence", addressCountry: "BS" },
      sameAs: ["https://www.instagram.com/test_booth/", "https://example.com", "https://g.page/r/TEST"],
    });
    const offers = business.makesOffer as Array<Record<string, unknown>>;
    // Only real prices are offered, each with the unit the page shows.
    expect(offers.map((offer) => [offer.name, offer.price, offer.priceCurrency])).toEqual([["Two hours", "300.00", "BSD"], ["Saturday class", "35.00", "BSD"], ["Wedding package", undefined, "BSD"]]);
    expect(offers[0]).not.toHaveProperty("priceSpecification");
    expect(offers[1].priceSpecification).toMatchObject({ "@type": "UnitPriceSpecification", price: "35.00", unitText: "per session" });
    // "From $500" is a lowest price, never a flat one.
    expect(offers[2].priceSpecification).toMatchObject({ minPrice: "500.00", priceCurrency: "BSD" });
    expect((offers[1].itemOffered as Record<string, unknown>)["@type"]).toBe("Course");
    // No dates the page doesn't show.
    expect(data["@graph"].some((node) => node["@type"] === "Event")).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/startDate|endDate/);
    expect(data["@graph"].find((node) => node["@type"] === "FAQPage")).toMatchObject({ mainEntity: [{ name: "Do you travel?", acceptedAnswer: { text: "Anywhere on New Providence." } }, {}, {}] });
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|reviewCount|ratingValue/);
  });

  it("prints questions only when the page shows them", () => {
    expect(FAQ_MINIMUM).toBe(3);
    const two = businessJsonLd(booth, [], faqs.slice(0, 2)) as Graph;
    expect(two["@graph"].some((node) => node["@type"] === "FAQPage")).toBe(false);
  });

  it("never says Nassau for another island", () => {
    expect(ldAddress("George Town", "Exuma")).toEqual({ "@type": "PostalAddress", addressLocality: "George Town", addressRegion: "Exuma", addressCountry: "BS" });
    expect(ldAddress(null, "Exuma")).toEqual({ "@type": "PostalAddress", addressRegion: "Exuma", addressCountry: "BS" });
    expect(ldAddress(null, null)).toMatchObject({ addressLocality: "Nassau", addressRegion: "New Providence" });
  });

  it("leaves out what it doesn't know, rather than inventing it", () => {
    const bare = businessJsonLd({ ...booth, description: null, heroImageUrl: null, websiteUrl: null, instagramHandle: null, googleBusinessUrl: null, whatsappE164: null, area: null }, []) as Graph;
    const business = bare["@graph"][0];
    expect(business).not.toHaveProperty("telephone");
    expect(business).not.toHaveProperty("priceRange");
    expect(business).not.toHaveProperty("sameAs");
    expect(business).not.toHaveProperty("image");
    expect(business).toMatchObject({ address: { addressLocality: "Nassau" } });
    expect(bare["@graph"]).toHaveLength(1);
  });

  it("picks the closest kind of business for each section", () => {
    expect(businessType("sports-fitness", null)).toBe("SportsActivityLocation");
    expect(businessType("venues", null)).toEqual(["LocalBusiness", "EventVenue"]);
    expect(businessType("tours", "boats")).toEqual(["LocalBusiness", "TouristAttraction"]);
    expect(businessType("services", "phone-tech-repair")).toBe("ElectronicsStore");
    expect(businessType("something-new", null)).toBe("LocalBusiness");
    expect(businessType(null, null)).toBe("LocalBusiness");
  });

  it("lists a section's businesses in order", () => {
    const data = sectionJsonLd({ name: "Entertainment", path: "/entertainment", description: "TEST", businesses: [{ name: "A", path: "/entertainment/a" }, { name: "B", path: "/entertainment/b" }] });
    expect(data).toMatchObject({ "@type": "CollectionPage", mainEntity: { itemListElement: [{ position: 1, name: "A", url: "https://portpassbahamas.com/entertainment/a" }, { position: 2, name: "B" }] } });
    expect(sectionJsonLd({ name: "Venues", path: "/venues", description: "TEST", businesses: [] })).not.toHaveProperty("mainEntity");
  });

  it("can't be broken out of by what a business typed", () => {
    const printed = jsonLdString({ name: "</script><script>alert(1)</script> & co" });
    expect(printed).not.toContain("</script>");
    expect(printed).not.toContain("<");
    expect(JSON.parse(printed)).toEqual({ name: "</script><script>alert(1)</script> & co" });
  });

  it("writes a price range in dollars", () => {
    expect(priceRange([{ priceCents: 3500 }, { priceCents: 30000 }, { priceCents: null }])).toBe("$35–$300");
    expect(priceRange([{ priceCents: 4950 }])).toBe("$49.50");
    expect(priceRange([{ priceCents: null }])).toBeUndefined();
  });
});

describe("titles and descriptions", () => {
  it("gives each section, subsection and business its own title", () => {
    expect(sectionTitle("Sports & Fitness")).toBe("Sports & Fitness in Nassau & The Bahamas | PortPass Bahamas");
    expect(sectionTitle("Entertainment", "Photo Booths")).toBe("Photo Booths · Entertainment in Nassau | PortPass Bahamas");
    expect(businessTitle("Futprep Athletics", "Kids' football programmes", "Nassau")).toBe("Futprep Athletics: Kids' football programmes in Nassau | PortPass");
    expect(businessTitle("TEST Booth", "Photo Booths", "Cable Beach")).toBe("TEST Booth: Photo Booths in Cable Beach, Nassau | PortPass");
    expect(businessTitle("TEST Booth", null, null)).toBe("TEST Booth in Nassau | PortPass");
    expect(businessTitle("TEST Boats", "Tours", "George Town", "Exuma")).toBe("TEST Boats: Tours in George Town, Exuma | PortPass");
    expect(businessTitle("TEST Boats", "Tours", null, "Exuma")).toBe("TEST Boats: Tours in Exuma | PortPass");
    expect(businessTitle("TEST Booth", null, "Cable Beach", "New Providence")).toBe("TEST Booth in Cable Beach, Nassau | PortPass");
  });

  it("uses real counts and names, and stays short enough for a search result", () => {
    expect(sectionDescription("Sports & Fitness", ["Futprep Athletics"])).toBe("1 sports & fitness business you can book in Nassau on PortPass: Futprep Athletics. Real prices, schedules and booking online.");
    const many = sectionDescription("Entertainment", ["A Very Long Business Name One", "A Very Long Business Name Two", "A Very Long Business Name Three", "Four", "Five"]);
    expect(many.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(many).toMatch(/^5 entertainment businesses/);
    expect(sectionDescription("Venues", [])).toMatch(/coming soon/);
    expect(businessDescription("TEST Booth", "Photo booths for parties.", 30000)).toBe("Photo booths for parties. From $300. See prices and book online on PortPass.");
    expect(businessDescription("TEST Booth", null, null)).toBe("TEST Booth in Nassau. See prices and book online on PortPass.");
  });

  it("cuts a long description at a word", () => {
    const cut = fitDescription(`${"word ".repeat(60)}end`);
    expect(cut.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/ …$/);
    expect(nameList(["A", "B", "C"])).toBe("A, B and C");
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
    expect(nameList(["A"])).toBe("A");
  });
});

describe("site search", () => {
  it("finds every word typed, whatever the case, accents or plurals", () => {
    // Small words don't count, and nor does the place when something else is asked for.
    expect(searchTerms("Kids FOOTBALL in Nassau")).toEqual(["kids", "football"]);
    expect(searchTerms("a photo booth in the Bahamas")).toEqual(["photo", "booth"]);
    expect(searchTerms("Nassau")).toEqual(["nassau"]);
    expect(matchesQuery(searchTerms("kids football in nassau"), ["Futprep Athletics", "Kids football programmes"])).toBe(true);
    expect(matchesQuery(searchTerms("kids football"), ["Futprep Athletics", "Kids football programmes in Nassau"])).toBe(true);
    expect(matchesQuery(searchTerms("photo booths"), ["TEST Booth", "Photo booth for parties"])).toBe(true);
    expect(matchesQuery(searchTerms("café"), ["Cafe Matisse"])).toBe(true);
    expect(matchesQuery(searchTerms("wedding football"), ["Futprep Athletics", "Kids football"])).toBe(false);
    expect(matchesQuery(searchTerms(""), ["anything"])).toBe(false);
    expect(searchTerms("a b")).toEqual([]);
  });

  it("shows the closest matches, marked, when nothing has every word", () => {
    const businesses = [{ name: "TEST Boats", line: "Boat tours" }, { name: "Futprep Athletics", line: "Saturday football for ages 1 to 6" }, { name: "TEST Football Kids", line: "Kids football camps" }];
    const fields = (b: { name: string; line: string }) => [b.name, b.line];
    expect(matchCount(searchTerms("kids football"), fields(businesses[1]))).toBe(1);
    expect(rankMatches(searchTerms("kids football"), businesses, fields)).toEqual({ exact: true, items: [businesses[2]] });
    expect(rankMatches(searchTerms("kids football"), businesses.slice(0, 2), fields)).toEqual({ exact: false, items: [businesses[1]] });
    // One word typed: only what has it.
    expect(rankMatches(searchTerms("golf"), businesses, fields)).toEqual({ exact: true, items: [] });
  });
});

describe("the Google Business Profile link", () => {
  it("keeps only a Google address", () => {
    for (const ok of ["https://g.page/r/CTEST/review", "https://maps.app.goo.gl/TEST", "https://www.google.com/maps/place/TEST", "https://business.google.com/TEST"]) expect(isGoogleBusinessUrl(ok)).toBe(true);
    for (const bad of ["http://g.page/r/TEST", "https://google.com.evil.example/x", "https://evilgoogle.com/x", "https://user:pw@g.page/x", "javascript:alert(1)", "g.page/r/TEST", ""]) expect(isGoogleBusinessUrl(bad)).toBe(false);
  });

  it("stores the link the way the database expects", () => {
    expect(cleanGoogleBusinessUrl("https://G.Page/r/TEST")).toBe("https://g.page/r/TEST");
    expect(cleanGoogleBusinessUrl("https://g.page:8443/r/TEST")).toBeNull();
    expect(cleanGoogleBusinessUrl("https://example.com")).toBeNull();
    // Longer than the database allows: refused, never cut short.
    expect(cleanGoogleBusinessUrl(`https://g.page/r/${"x".repeat(300)}`)).toBeNull();
  });

  it("writes the message the business sends one customer itself", () => {
    expect(reviewRequestMessage("TEST Booth", "https://g.page/r/TEST")).toBe("Thank you for choosing TEST Booth! If you have a minute, a short Google review helps other families and visitors find us: https://g.page/r/TEST");
  });
});
