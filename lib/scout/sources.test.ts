import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLeadPatch, parseNewLead } from "./input";
import { businessDiscoveryUrl, lookupInstagram, mapBusinessDiscovery } from "./instagram";
import { mapPlace, PLACES_ENDPOINT, PLACES_FIELD_MASK, placesRequestBody, searchPlaces } from "./places";

// The two outside sources PortPass Scout may use (brief 14 §1), with the
// network faked: what is asked for, what is kept, and that neither does
// anything when its key is missing.

const SECTIONS = [{ slug: "entertainment", name: "Entertainment", subcategories: [{ slug: "party-rentals", name: "Party Rentals" }] }];
const env = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const key of ["GOOGLE_PLACES_API_KEY", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_GRAPH_ACCESS_TOKEN"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  vi.restoreAllMocks();
});

describe("Google Places text search", () => {
  it("asks only for a business's published details, in The Bahamas", () => {
    expect(placesRequestBody("  kids football academy Nassau ")).toEqual({ textQuery: "kids football academy Nassau", regionCode: "BS", maxResultCount: 20, languageCode: "en" });
    expect(PLACES_FIELD_MASK.split(",")).toEqual(expect.arrayContaining(["places.id", "places.displayName", "places.formattedAddress", "places.websiteUri", "places.rating", "places.userRatingCount", "places.googleMapsUri"]));
    expect(PLACES_FIELD_MASK).not.toMatch(/reviews|photos|editorialSummary/);
  });

  it("keeps name, category, address, phone, website, rating and the Maps link", () => {
    expect(mapPlace({
      id: "ChIJtestplace0001", displayName: { text: "TEST Party Rentals" }, primaryTypeDisplayName: { text: "Party equipment rental service" }, formattedAddress: "Nassau, The Bahamas",
      nationalPhoneNumber: "(242) 555-0123", internationalPhoneNumber: "+1 242-555-0123", websiteUri: "https://testrentals.example/", rating: 4.66, userRatingCount: 37, googleMapsUri: "https://maps.google.com/?cid=1", businessStatus: "OPERATIONAL",
    })).toEqual({
      placeId: "ChIJtestplace0001", name: "TEST Party Rentals", category: "Party equipment rental service", address: "Nassau, The Bahamas", phone: "(242) 555-0123", internationalPhone: "+1 242-555-0123",
      websiteUrl: "https://testrentals.example/", rating: 4.7, ratingCount: 37, mapsUrl: "https://maps.google.com/?cid=1",
    });
  });

  it("skips a place with no name, and one that has closed for good", () => {
    expect(mapPlace({ id: "x" })).toBeNull();
    expect(mapPlace({ id: "ChIJclosed", displayName: { text: "Gone" }, businessStatus: "CLOSED_PERMANENTLY" })).toBeNull();
    expect(mapPlace(null)).toBeNull();
  });

  it("does nothing without a key, and sends the key in a header, never the address", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(await searchPlaces("party rentals Nassau")).toEqual({ ok: false, reason: "not_configured" });

    process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      return new Response(JSON.stringify({ places: [{ id: "ChIJtestplace0001", displayName: { text: "TEST Party Rentals" } }, { id: "bad" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await searchPlaces("party rentals Nassau", fetcher);
    expect(result.ok && result.places.map((p) => p.name)).toEqual(["TEST Party Rentals"]);
    expect(calls[0].url).toBe(PLACES_ENDPOINT);
    expect(calls[0].url).not.toContain("test-key-not-real");
    expect(calls[0].headers["X-Goog-Api-Key"]).toBe("test-key-not-real");
    expect(await searchPlaces("ab", fetcher)).toEqual({ ok: false, reason: "bad_query" });
  });
});

describe("Instagram Business Discovery", () => {
  it("asks about one handle: bio, website, followers and the last 12 captions", () => {
    const url = decodeURIComponent(businessDiscoveryUrl("17840000000000000", "test_party_rentals"));
    expect(url).toContain("/17840000000000000?fields=business_discovery.username(test_party_rentals){username,name,biography,website,followers_count,media_count,media.limit(12){caption,timestamp,permalink}}");
    expect(url).not.toContain("access_token");
  });

  it("keeps the public profile and captions only", () => {
    const profile = mapBusinessDiscovery({ business_discovery: { username: "test_party_rentals", name: "TEST Party Rentals", biography: "DM to book", website: "testrentals.example", followers_count: 1200, media_count: 80, media: { data: [{ caption: "Fully booked Saturday", timestamp: "2026-09-28T15:00:00+0000", permalink: "https://www.instagram.com/p/abc/" }, { timestamp: "2026-09-20T15:00:00+0000" }] } } }, "test_party_rentals");
    expect(profile).toMatchObject({ handle: "test_party_rentals", biography: "DM to book", websiteUrl: "https://testrentals.example/", followers: 1200, profileUrl: "https://www.instagram.com/test_party_rentals/" });
    expect(profile!.captions).toEqual([{ caption: "Fully booked Saturday", postedAt: "2026-09-28T15:00:00+0000", permalink: "https://www.instagram.com/p/abc/" }]);
    expect(mapBusinessDiscovery({ error: { message: "nope" } }, "x")).toBeNull();
  });

  it("refuses anything that isn't a handle, does nothing without credentials, and sends the token in a header", async () => {
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    delete process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN;
    expect(await lookupInstagram("@test_party_rentals")).toEqual({ ok: false, reason: "not_configured" });

    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "17840000000000000";
    process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN = "test-token-not-real";
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      return new Response(JSON.stringify({ business_discovery: { username: "test_party_rentals", biography: "DM to book" } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await lookupInstagram("someone's whole sentence){evil", fetcher)).toEqual({ ok: false, reason: "bad_handle" });
    expect(calls).toHaveLength(0);
    const found = await lookupInstagram("https://instagram.com/Test_Party_Rentals/", fetcher);
    expect(found.ok && found.profile.handle).toBe("test_party_rentals");
    expect(calls[0].url).not.toContain("test-token-not-real");
    expect(calls[0].headers.Authorization).toBe("Bearer test-token-not-real");
  });
});

describe("what the Leads screens may send", () => {
  it("builds a lead from a founder's form, keeping only well-formed values", () => {
    const parsed = parseNewLead({ businessName: "  TEST Party Rentals ", section: "entertainment", subsection: "party-rentals", instagramHandle: "@Test_Party_Rentals", phone: "242-555-0123", websiteUrl: "javascript:alert(1)", email: "not an email", warmConnection: true, source: "tracker_import" }, SECTIONS);
    expect(parsed.ok && parsed.draft).toMatchObject({ businessName: "TEST Party Rentals", section: "entertainment", subsection: "party-rentals", instagramHandle: "test_party_rentals", whatsappE164: "+12425550123", websiteUrl: null, email: null, source: "founder", status: "new" });
    expect(parsed.ok && parsed.warmConnection).toBe(true);
    expect(parseNewLead({ businessName: " " }, SECTIONS)).toEqual({ ok: false, error: "Enter the business name." });
    expect(parseNewLead({ businessName: "TEST Referred", source: "referral" }, SECTIONS).ok).toBe(false);
    expect(parseNewLead({ businessName: "TEST Referred", source: "referral", referralCode: "FUTPREP" }, SECTIONS).ok).toBe(true);
  });

  it("refuses a status, section or link that isn't real, and changes only what was sent", () => {
    expect(parseLeadPatch({ status: "sold" }, SECTIONS)).toEqual({ ok: false, error: "That isn't a lead status." });
    expect(parseLeadPatch({ section: "crypto" }, SECTIONS).ok).toBe(false);
    expect(parseLeadPatch({ websiteUrl: "javascript:alert(1)" }, SECTIONS).ok).toBe(false);
    expect(parseLeadPatch({ lastContactOn: "yesterday" }, SECTIONS).ok).toBe(false);
    expect(parseLeadPatch({}, SECTIONS)).toEqual({ ok: false, error: "Nothing to save." });
    const patch = parseLeadPatch({ status: "contacted", nextStep: " Send the preview ", phone: "242 555 0123" }, SECTIONS);
    expect(patch).toEqual({ ok: true, patch: { status: "contacted", nextStep: "Send the preview", phone: "242 555 0123", whatsappE164: "+12425550123" } });
    // Two numbers in the cell: the first one is the WhatsApp number, as on import.
    expect(parseLeadPatch({ phone: "242-555-0101 / 242-555-0102" }, SECTIONS)).toEqual({ ok: true, patch: { phone: "242-555-0101 / 242-555-0102", whatsappE164: "+12425550101" } });
  });
});
