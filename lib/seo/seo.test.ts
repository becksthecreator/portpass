import { describe, expect, it } from "vitest";
import { cleanGoogleBusinessUrl, isGoogleBusinessUrl, reviewRequestMessage } from "./googleBusiness";
import { businessJsonLd, businessType, homeJsonLd, jsonLdString, priceRange, sectionJsonLd, type LdBusiness } from "./jsonLd";
import { matchesQuery, searchTerms } from "./search";
import { businessDescription, businessTitle, DESCRIPTION_MAX, fitDescription, nameList, sectionDescription, sectionTitle } from "./titles";

const booth: LdBusiness = {
  name: "TEST Photo Booth", path: "/entertainment/test-photo-booth", section: "entertainment", subcategory: "photo-booths", description: "Photo booths for parties", area: "Cable Beach", island: "New Providence",
  phoneE164: null, whatsappE164: "+12425550100", heroImageUrl: "/photos/booth.jpg", logoUrl: null, websiteUrl: "https://example.com", instagramHandle: "@test_booth", googleBusinessUrl: "https://g.page/r/TEST",
};

type Graph = { "@graph": Array<Record<string, unknown>> };

describe("structured data", () => {
  it("says who PortPass is and where its search is, on the homepage", () => {
    const home = homeJsonLd() as Graph;
    const types = home["@graph"].map((node) => node["@type"]);
    expect(types).toEqual(["Organization", "WebSite"]);
    expect(JSON.stringify(home)).toContain("https://portpassbahamas.com/search?q={search_term_string}");
  });

  it("describes a business with its address, prices in BSD, links and questions, and never a rating", () => {
    const data = businessJsonLd(
      booth,
      [
        { name: "Two hours", type: "service", summary: "Unlimited prints", priceCents: 30000, termStart: null, termEnd: null, eventDate: null, actionUrl: null },
        { name: "Saturday class", type: "program", summary: null, priceCents: 3500, termStart: "2027-01-09", termEnd: "2027-03-27", eventDate: null, actionUrl: "/futprep/register" },
        { name: "Ask for a price", type: "service", summary: null, priceCents: null, termStart: null, termEnd: null, eventDate: null, actionUrl: null },
      ],
      [{ question: "Do you travel?", answer: "Anywhere on New Providence." }],
    ) as Graph;
    const business = data["@graph"][0];
    expect(business).toMatchObject({
      "@type": "EntertainmentBusiness",
      name: "TEST Photo Booth",
      url: "https://portpassbahamas.com/entertainment/test-photo-booth",
      telephone: "+12425550100",
      priceRange: "$35–$300",
      address: { addressLocality: "Cable Beach", addressRegion: "New Providence", addressCountry: "BS" },
      sameAs: ["https://www.instagram.com/test_booth/", "https://example.com", "https://g.page/r/TEST"],
    });
    const offers = business.makesOffer as Array<Record<string, unknown>>;
    // Only real prices are offered.
    expect(offers.map((offer) => [offer.name, offer.price, offer.priceCurrency])).toEqual([["Two hours", "300.00", "BSD"], ["Saturday class", "35.00", "BSD"]]);
    expect((offers[1].itemOffered as Record<string, unknown>)["@type"]).toBe("Course");
    // The programme's term is an event with its dates.
    expect(data["@graph"].find((node) => node["@type"] === "Event")).toMatchObject({ startDate: "2027-01-09", endDate: "2027-03-27" });
    expect(data["@graph"].find((node) => node["@type"] === "FAQPage")).toMatchObject({ mainEntity: [{ name: "Do you travel?", acceptedAnswer: { text: "Anywhere on New Providence." } }] });
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|reviewCount|ratingValue/);
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
    const terms = searchTerms("Kids FOOTBALL in Nassau");
    expect(terms).toEqual(["kids", "football", "in", "nassau"]);
    expect(matchesQuery(searchTerms("kids football"), ["Futprep Athletics", "Kids football programmes in Nassau"])).toBe(true);
    expect(matchesQuery(searchTerms("photo booths"), ["TEST Booth", "Photo booth for parties"])).toBe(true);
    expect(matchesQuery(searchTerms("café"), ["Cafe Matisse"])).toBe(true);
    expect(matchesQuery(searchTerms("wedding football"), ["Futprep Athletics", "Kids football"])).toBe(false);
    expect(matchesQuery(searchTerms(""), ["anything"])).toBe(false);
    expect(searchTerms("a b")).toEqual([]);
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
  });

  it("writes the message the business sends one customer itself", () => {
    expect(reviewRequestMessage("TEST Booth", "https://g.page/r/TEST")).toBe("Thank you for choosing TEST Booth! If you have a minute, a short Google review helps other families and visitors find us: https://g.page/r/TEST");
  });
});
