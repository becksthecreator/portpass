import { describe, expect, it } from "vitest";
import { bookingMethodFrom, cleanUrl, dedupeKey, leadWhatsappLink, normalizeInstagramHandle, parseTrackerCsv, scoreAction, scoreLead, trackerStatus } from "./leads";

const SECTIONS = [
  { slug: "sports-fitness", name: "Sports & Fitness", subcategories: [{ slug: "football-soccer", name: "Football / Soccer" }, { slug: "sailing", name: "Sailing" }, { slug: "strength-conditioning", name: "Strength & Conditioning" }] },
  { slug: "entertainment", name: "Entertainment", subcategories: [{ slug: "party-rentals", name: "Party Rentals" }, { slug: "photo-booths", name: "Photo Booths" }] },
];

describe("one row per business", () => {
  it("treats case, punctuation, accents and '&' as the same name", () => {
    const key = dedupeKey("Bahamas National Sailing School");
    expect(dedupeKey("  bahamas national   sailing-school. ")).toBe(key);
    expect(dedupeKey("BAHAMAS NATIONAL SAILING SCHOOL")).toBe(key);
    expect(dedupeKey("Café & Co")).toBe("cafe and co");
    expect(dedupeKey("!!!")).toBe("");
  });

  it("reads an Instagram handle however it was pasted, and nothing else", () => {
    expect(normalizeInstagramHandle("@Futprep_Athletics")).toBe("futprep_athletics");
    expect(normalizeInstagramHandle("https://www.instagram.com/futprep_athletics/?hl=en")).toBe("futprep_athletics");
    expect(normalizeInstagramHandle("instagram.com/p/Cxyz123")).toBeNull();
    expect(normalizeInstagramHandle("58")).toBe("58");
    expect(normalizeInstagramHandle("see our page for details")).toBeNull();
    expect(normalizeInstagramHandle("")).toBeNull();
  });

  it("keeps only real web links", () => {
    expect(cleanUrl("bahsailingschool.org")).toBe("https://bahsailingschool.org/");
    expect(cleanUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("none")).toBeNull();
  });
});

describe("the Handbook lead score", () => {
  it("adds the signals that are true and nothing else", () => {
    const { score, reasons } = scoreLead({ books_by_dm: true, publishes_prices: true, high_value: true, posted_recently: true }, { books_by_dm: "Bio says DM to book" });
    expect(score).toBe(65);
    expect(reasons.map((r) => r.points)).toEqual([25, 15, 15, 10]);
    expect(reasons[0]).toMatchObject({ key: "books_by_dm", why: "Bio says DM to book" });
  });

  it("takes 30 off for a business that already books online, and never goes below 0 or above 100", () => {
    expect(scoreLead({ online_booking: true }).score).toBe(0);
    expect(scoreLead({ publishes_prices: true, online_booking: true, real_demand: true }).score).toBe(0);
    const everything = scoreLead({ books_by_dm: true, publishes_prices: true, high_value: true, posted_recently: true, real_demand: true, limited_inventory: true, section_we_fill: true, warm_connection: true });
    expect(everything.score).toBe(100);
  });

  it("says what to do with the score: 70+ call, 40 to 69 message, under 40 park", () => {
    expect(scoreAction(70)).toBe("call");
    expect(scoreAction(69)).toBe("message");
    expect(scoreAction(40)).toBe("message");
    expect(scoreAction(39)).toBe("park");
    expect(scoreAction(null)).toBe("unscored");
  });
});

describe("sending is always by hand", () => {
  it("builds a wa.me link a founder opens themselves", () => {
    expect(leadWhatsappLink("+12425550123", "Hi there")).toBe("https://wa.me/12425550123?text=Hi%20there");
    expect(leadWhatsappLink("+12425550123", "")).toBe("https://wa.me/12425550123");
    expect(leadWhatsappLink(null, "Hi")).toBeNull();
  });
});

describe("the Prospect Tracker import", () => {
  it("maps the tracker's statuses, and 'Do not contact' wins over everything", () => {
    expect(trackerStatus("Not contacted", "")).toBe("new");
    expect(trackerStatus("Contacted", "")).toBe("contacted");
    expect(trackerStatus("Meeting", "")).toBe("replied");
    expect(trackerStatus("Page built", "")).toBe("page_drafted");
    expect(trackerStatus("Onboarding — needs price", "")).toBe("page_drafted");
    expect(trackerStatus("Live", "")).toBe("live");
    expect(trackerStatus("Not now", "")).toBe("not_now");
    expect(trackerStatus("Live", "Yes")).toBe("do_not_contact");
  });

  it("reads how a business takes bookings from the tracker's free text", () => {
    expect(bookingMethodFrom("WhatsApp and Instagram DM")).toBe("whatsapp_dm");
    expect(bookingMethodFrom("DM on Instagram")).toBe("instagram_dm");
    expect(bookingMethodFrom("Call the office")).toBe("phone");
    expect(bookingMethodFrom("Online booking through FareHarbor")).toBe("website_booking");
    expect(bookingMethodFrom("Download PDF application form, contact by email")).toBe("unknown");
    expect(bookingMethodFrom("—")).toBe("unknown");
  });

  it("turns the Prospects sheet into leads with statuses and scores intact", () => {
    const csv = [
      "#,Section,Subcategory,Business,What they do,How they book today,Online payment today,Instagram,Phone / WhatsApp,Email,Website,Why a good fit,Priority,Status,Owner,Next step,Last contact,Notes,Source,Lead score (0-100),Source,Date added,Do not contact",
      '1,Sports & Fitness,Football/Soccer,TEST Football Club,"Youth football, two age groups",WhatsApp,No,@test_fc,242-555-0123,hello@testfc.example,testfc.example,Books by WhatsApp,1,Contacted,Antonio,Send preview,2026-09-20,Warm,Hand research,78,IG,2026-09-27,',
      "2,Entertainment,Party rentals,TEST Party Rentals,Tents and chairs,Phone,No,,,,,,2,Not contacted,,,,,,45,,,",
      "3,Entertainment,Photo booths,TEST Booths,Photo booths,Instagram DM,No,@test_booths,,,,,3,Not now,,,,,,,,,Yes",
      "4,Tours,Boats,,No name here,,,,,,,,,,,,,,,,,,",
      "5,Entertainment,Party rentals,Test  Party  Rentals.,Duplicate of row 2,,,,,,,,,,,,,,,,,,",
    ].join("\n");
    const { drafts, skipped } = parseTrackerCsv(csv, SECTIONS);
    expect(drafts.map((d) => d.businessName)).toEqual(["TEST Football Club", "TEST Party Rentals", "TEST Booths"]);
    expect(skipped.map((s) => s.row)).toEqual([5, 6]);

    const [club, rentals, booths] = drafts;
    expect(club).toMatchObject({
      section: "sports-fitness", subsection: "football-soccer", bookingMethod: "whatsapp_dm", instagramHandle: "test_fc", whatsappE164: "+12425550123",
      email: "hello@testfc.example", websiteUrl: "https://testfc.example/", priority: 1, score: 78, status: "contacted", owner: "Antonio", nextStep: "Send preview",
      lastContactOn: "2026-09-20", source: "tracker_import",
    });
    expect(club.sourceUrls).toEqual(["https://testfc.example/", "https://www.instagram.com/test_fc/"]);
    expect(rentals).toMatchObject({ section: "entertainment", subsection: "party-rentals", bookingMethod: "phone", score: 45, status: "new" });
    expect(booths).toMatchObject({ status: "do_not_contact", score: null, subsection: "photo-booths" });
  });
});
