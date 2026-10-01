import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captionsForAi, enrichWithClaude, enrichmentTool, messageProblem, parseEnrichment, postedInLast30Days, publicTextForAi, redactPublicText, scoreFromEnrichment, scoutModel, type EnrichmentSubject } from "./enrich";
import type { InstagramProfile } from "./instagram";

const SECTIONS = [
  { slug: "sports-fitness", name: "Sports & Fitness", subcategories: [{ slug: "football-soccer", name: "Football / Soccer" }] },
  { slug: "entertainment", name: "Entertainment", subcategories: [{ slug: "party-rentals", name: "Party Rentals" }] },
];

const SUBJECT: EnrichmentSubject = {
  businessName: "TEST Party Rentals", whatTheyDo: "Tents, tables and chairs", googleCategory: "Party equipment rental service", address: "Nassau, The Bahamas",
  websiteUrl: null, instagramHandle: "test_party_rentals", knownBooking: "unknown", knownPrices: null,
};

function profile(captions: Array<{ caption: string; postedAt: string | null }>): InstagramProfile {
  return { handle: "test_party_rentals", name: "TEST Party Rentals", biography: "DM to book. Call 242-555-0123 or email owner@example.com", websiteUrl: null, followers: 1200, mediaCount: 80, captions: captions.map((c) => ({ ...c, permalink: null })), profileUrl: "https://www.instagram.com/test_party_rentals/" };
}

describe("what the AI is allowed to see", () => {
  it("strips emails, phone numbers and other people's accounts from public text", () => {
    const text = redactPublicText("Thanks @happy_customer_jane! Call 242-555-0123 or +1 (242) 555 0199, or email jane.doe@example.com. Tag @test_party_rentals. Tents from $350.", "test_party_rentals");
    expect(text).not.toContain("happy_customer_jane");
    expect(text).not.toContain("555");
    expect(text).not.toContain("jane.doe@example.com");
    expect(text).toContain("@test_party_rentals");
    expect(text).toContain("$350");
  });

  it("sends the business's own facts and captions, redacted", () => {
    const block = publicTextForAi(SUBJECT, profile([{ caption: "Fully booked this Saturday! Thanks @some_person. WhatsApp 242-555-0123 to book.", postedAt: "2026-09-28T15:00:00+0000" }]));
    expect(block).toContain("Business: TEST Party Rentals");
    expect(block).toContain("Instagram bio: DM to book.");
    expect(block).toContain("Fully booked this Saturday!");
    expect(block).not.toContain("some_person");
    expect(block).not.toContain("242-555");
    expect(block).not.toContain("owner@example.com");
  });

  it("strips a local number however it is written", () => {
    expect(redactPublicText("WhatsApp 4238161 to book", null)).toBe("WhatsApp [number] to book");
    expect(redactPublicText("Call 242/423/8161", null)).toBe("Call [number]");
    expect(redactPublicText("Tents from $350, tables $12", null)).toBe("Tents from $350, tables $12");
  });

  it("sends only posts about prices, booking or availability, and never a post about a person", () => {
    const posts = profile([
      { caption: "Fully booked this Saturday! DM to book the next one.", postedAt: "2026-09-28T15:00:00+0000" },
      { caption: "Happy 7th birthday TEST Child! DM to book your party.", postedAt: "2026-09-27T15:00:00+0000" },
      { caption: "U9 player of the week: TEST Child. Spots available.", postedAt: "2026-09-26T15:00:00+0000" },
      { caption: "Beautiful sunset at the field tonight.", postedAt: "2026-09-25T15:00:00+0000" },
      { caption: "Tents from $350.", postedAt: "2026-09-24T15:00:00+0000" },
    ]);
    expect(captionsForAi(posts).map((p) => p.caption)).toEqual(["Fully booked this Saturday! DM to book the next one.", "Tents from $350."]);
    const block = publicTextForAi(SUBJECT, posts);
    expect(block).not.toContain("TEST Child");
    expect(block).not.toContain("sunset");
    expect(block).not.toContain("Our notes");
  });

  it("works out 'posted in the last 30 days' from the post dates, not from the model", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(postedInLast30Days(profile([{ caption: "a", postedAt: "2026-09-10T10:00:00+0000" }]), now)).toBe(true);
    expect(postedInLast30Days(profile([{ caption: "a", postedAt: "2026-08-01T10:00:00+0000" }]), now)).toBe(false);
    expect(postedInLast30Days(profile([{ caption: "a", postedAt: null }]), now)).toBe(false);
    expect(postedInLast30Days(null, now)).toBe(false);
  });
});

describe("what comes back is checked, not trusted", () => {
  const good = {
    section: "entertainment", subsection: "party-rentals", area: "Nassau", island: "New Providence", booking_method: "whatsapp_dm", prices_mentioned: "Tents from $350",
    signals: { books_by_dm: true, publishes_prices: true, high_value: true, real_demand: true, limited_inventory: false, online_booking: false },
    signal_reasons: { books_by_dm: "Bio says DM to book", publishes_prices: "Caption: tents from $350", limited_inventory: "ignored because the signal is false" },
    first_message: "Hi! I saw your tent setups in Nassau. How many times a day do you answer the same price question? I'm Antonio from PortPass Bahamas. We'd build you a page with your prices, free to try for 30 days. Want to see it?",
  };

  it("keeps a well-formed answer", () => {
    const parsed = parseEnrichment(good, SECTIONS)!;
    expect(parsed).toMatchObject({ section: "entertainment", subsection: "party-rentals", area: "Nassau", island: "New Providence", bookingMethod: "whatsapp_dm", pricesText: "Tents from $350", messageProblem: null });
    expect(parsed.signals).toEqual({ books_by_dm: true, publishes_prices: true, high_value: true, real_demand: true, limited_inventory: false, online_booking: false });
    expect(parsed.why).toEqual({ books_by_dm: "Bio says DM to book", publishes_prices: "Caption: tents from $350" });
    expect(parsed.message).toContain("PortPass Bahamas");
  });

  it("drops a section or booking method we never offered", () => {
    const parsed = parseEnrichment({ ...good, section: "crypto", subsection: "party-rentals", booking_method: "telepathy" }, SECTIONS)!;
    expect(parsed.section).toBeNull();
    expect(parsed.subsection).toBeNull();
    expect(parsed.bookingMethod).toBe("unknown");
  });

  it("treats anything but a real true as false", () => {
    const parsed = parseEnrichment({ ...good, signals: { books_by_dm: "yes", publishes_prices: 1, high_value: true } }, SECTIONS)!;
    expect(parsed.signals).toMatchObject({ books_by_dm: false, publishes_prices: false, high_value: true, online_booking: false });
  });

  it("throws away a draft that mentions card payments, says 'one-stop shop', or runs long", () => {
    expect(messageProblem("Hi! Your customers can pay by card on PortPass Bahamas.")).toMatch(/card/);
    expect(messageProblem("We take online payments for you.")).toMatch(/card or online/);
    expect(messageProblem("PortPass Bahamas is your one-stop shop.")).toMatch(/one-stop/);
    expect(messageProblem(Array.from({ length: 90 }, () => "word").join(" "))).toMatch(/too long/);
    expect(messageProblem("Hi from PortPass Bahamas. Confirm your listing at https://evil.example now.")).toMatch(/link/);
    expect(messageProblem("Hi from PortPass Bahamas. See evil-site.com for your page.")).toMatch(/link/);
    expect(messageProblem("Hi from PortPass Bahamas. Message @someone_else to book.")).toMatch(/account name/);
    expect(messageProblem(good.first_message)).toBeNull();
    const parsed = parseEnrichment({ ...good, first_message: "Pay by Visa or Mastercard on PortPass Bahamas!" }, SECTIONS)!;
    expect(parsed.message).toBeNull();
    expect(parsed.messageProblem).toMatch(/card/);
  });

  it("returns null for something that isn't an answer at all", () => {
    expect(parseEnrichment(null, SECTIONS)).toBeNull();
    expect(parseEnrichment("section: entertainment", SECTIONS)).toBeNull();
  });

  it("does the score's arithmetic itself, from the model's signals plus what we know", () => {
    const parsed = parseEnrichment(good, SECTIONS)!;
    const scored = scoreFromEnrichment(parsed, { postedRecently: true, sectionWeFill: true, warmConnection: false });
    // 25 + 15 + 15 + 10 (demand) + 10 (posted) + 10 (section) = 85
    expect(scored.score).toBe(85);
    expect(scored.reasons.find((r) => r.key === "books_by_dm")?.why).toBe("Bio says DM to book");
  });

  it("never counts 'DM only' for a business that already books online", () => {
    const parsed = parseEnrichment({ ...good, signals: { ...good.signals, online_booking: true } }, SECTIONS)!;
    const scored = scoreFromEnrichment(parsed, { postedRecently: false, sectionWeFill: false, warmConnection: false });
    // 15 + 15 + 10 - 30 = 10
    expect(scored.score).toBe(10);
    expect(scored.reasons.some((r) => r.key === "books_by_dm")).toBe(false);
  });
});

describe("the call to Claude", () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, model: process.env.SCOUT_MODEL };
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    delete process.env.SCOUT_MODEL;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.model === undefined) delete process.env.SCOUT_MODEL;
    else process.env.SCOUT_MODEL = saved.model;
    vi.restoreAllMocks();
  });

  it("offers only our sections, forces the tool, and sends redacted text", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "record_lead", input: { section: "entertainment", subsection: null, area: null, island: null, booking_method: "unknown", prices_mentioned: null, signals: {}, first_message: "Hi from PortPass Bahamas. Want to see your page?" } }], usage: { input_tokens: 900, output_tokens: 150 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await enrichWithClaude(SUBJECT, profile([{ caption: "Call 242-555-0123", postedAt: null }]), SECTIONS, fetcher);
    expect(result).toMatchObject({ ok: true, model: "claude-fable-5-1", inputTokens: 900, outputTokens: 150 });
    const sent = calls[0];
    expect(sent.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.headers["x-api-key"]).toBe("test-key-not-real");
    expect(sent.body.tool_choice).toEqual({ type: "tool", name: "record_lead" });
    expect(JSON.stringify(sent.body.messages)).not.toContain("555");
    expect(enrichmentTool(SECTIONS).input_schema.properties.section.enum).toEqual(["sports-fitness", "entertainment", null]);
  });

  it("uses SCOUT_MODEL when it is set to something that looks like a model", () => {
    expect(scoutModel()).toBe("claude-fable-5-1");
    process.env.SCOUT_MODEL = "claude-sonnet-5-5";
    expect(scoutModel()).toBe("claude-sonnet-5-5");
    process.env.SCOUT_MODEL = "not a model; drop table";
    expect(scoutModel()).toBe("claude-fable-5-1");
  });

  it("is off without a key, and reports a provider error without throwing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await enrichWithClaude(SUBJECT, null, SECTIONS)).toEqual({ ok: false, reason: "not_configured" });
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    const failing = vi.fn(async () => new Response("overloaded", { status: 529 })) as unknown as typeof fetch;
    expect(await enrichWithClaude(SUBJECT, null, SECTIONS, failing)).toEqual({ ok: false, reason: "provider_error", status: 529 });
    const garbage = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hello" }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await enrichWithClaude(SUBJECT, null, SECTIONS, garbage)).toEqual({ ok: false, reason: "bad_response" });
  });
});
