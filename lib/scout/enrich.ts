import type { InstagramProfile } from "./instagram";
import { isBookingMethod, scoreLead, type BookingMethod, type ScoreReason, type ScoreSignalKey, type ScoreSignals } from "./leads";

// PortPass Scout's AI step (brief 14 §2): one call to the Claude API turns
// the public text collected about a business into a section, an area, how
// it takes bookings, the prices it mentions, the signals behind the
// Handbook lead score, and a first message for a founder to send by hand.
//
// Rules this file enforces rather than merely asks for:
// - Only public business information goes in. A founder's own notes are
//   never sent. Of a business's posts, only the ones about prices, booking
//   or availability are sent; a post that celebrates a person (a birthday,
//   a player of the week) is left out whole, because it usually names a
//   customer or a child. Emails, phone numbers and tagged accounts are
//   stripped from what remains. This narrows what leaves the server; it
//   cannot promise a name never appears in a post about prices.
// - The score's arithmetic is done in code (lib/scout/leads.ts); the model
//   only says which signals it saw, and why.
// - A draft message that mentions card payments, or runs long, is thrown
//   away rather than shown.
// - Nothing here sends a message to anyone.
//
// Server env var: ANTHROPIC_API_KEY. Optional: SCOUT_MODEL.

export const SCOUT_MODEL_DEFAULT = "claude-fable-5-1";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

export function scoutModel(): string {
  const configured = process.env.SCOUT_MODEL?.trim();
  return configured && /^[a-z0-9.-]{3,80}$/i.test(configured) ? configured : SCOUT_MODEL_DEFAULT;
}

export function enrichmentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type SectionOption = { slug: string; name: string; subcategories: Array<{ slug: string; name: string }> };

export type EnrichmentSubject = {
  businessName: string;
  whatTheyDo: string | null;
  googleCategory: string | null;
  address: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
  knownBooking: BookingMethod;
  knownPrices: string | null;
};

// The signals the model is asked about. The other three are facts we know
// better than it does: whether the business posted in the last 30 days
// (from the post dates), whether its section is one we're filling, and
// whether a founder marked the lead as a warm connection.
export const AI_SIGNALS = ["books_by_dm", "publishes_prices", "high_value", "real_demand", "limited_inventory", "online_booking"] as const satisfies readonly ScoreSignalKey[];
export type AiSignal = (typeof AI_SIGNALS)[number];

// Emails, phone numbers and mentions of other accounts never leave the
// server: a caption can name or tag a customer.
export function redactPublicText(text: string, ownHandle: string | null): string {
  const own = ownHandle?.toLowerCase() ?? null;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    // Seven digits or more, however they are spaced: 4238161, 242/423/8161.
    .replace(/(?:\+?\d[\d\s()./-]{5,}\d)/g, (match) => (match.replace(/\D/g, "").length >= 7 ? "[number]" : match))
    .replace(/@([A-Za-z0-9._]{1,30})/g, (match, handle: string) => {
      // A handle can't end in a full stop: that one belongs to the sentence.
      const name = handle.replace(/[.]+$/, "");
      return own && name.toLowerCase() === own ? match : `@[account]${handle.slice(name.length)}`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// Which posts are worth sending: the ones about prices, booking or
// availability. A post about a person is dropped whole.
const BUSINESS_CAPTION = /\$\s?\d|\b(prices?|pricing|rates?|fees?|cost|deposit|book|booking|bookings|booked|reserve|reservations?|order|orders|dm|whatsapp|call|sold out|waitlist|waiting list|spots?|spaces?|slots?|available|availability|limited|register|registration|sign up|enrol|enroll)\b/i;
const ABOUT_A_PERSON = /\b(birthday|bday|congrat\w*|happy \d+|turn(s|ed|ing) \d+|years? old|mvp|(player|student|camper|athlete|client|employee|coach) of the|shout ?out|rest in peace|in loving memory)\b/i;

export function captionsForAi(instagram: InstagramProfile): InstagramProfile["captions"] {
  return instagram.captions.filter((post) => BUSINESS_CAPTION.test(post.caption) && !ABOUT_A_PERSON.test(post.caption)).slice(0, 12);
}

// What the model sees, as one block of text.
export function publicTextForAi(subject: EnrichmentSubject, instagram: InstagramProfile | null): string {
  const lines: string[] = [`Business: ${subject.businessName}`];
  if (subject.googleCategory) lines.push(`Google category: ${subject.googleCategory}`);
  if (subject.address) lines.push(`Address: ${subject.address}`);
  if (subject.websiteUrl) lines.push(`Website: ${subject.websiteUrl}`);
  if (subject.whatTheyDo) lines.push(`What they do (our note): ${redactPublicText(subject.whatTheyDo, subject.instagramHandle).slice(0, 600)}`);
  if (subject.knownBooking !== "unknown") lines.push(`How they take bookings (our note): ${subject.knownBooking}`);
  if (subject.knownPrices) lines.push(`Prices (our note): ${redactPublicText(subject.knownPrices, subject.instagramHandle).slice(0, 400)}`);
  if (instagram) {
    lines.push(`Instagram: @${instagram.handle}${instagram.followers !== null ? ` (${instagram.followers} followers)` : ""}`);
    if (instagram.biography) lines.push(`Instagram bio: ${redactPublicText(instagram.biography, instagram.handle)}`);
    if (instagram.websiteUrl) lines.push(`Link in bio: ${instagram.websiteUrl}`);
    captionsForAi(instagram).forEach((post, i) => {
      lines.push(`Post ${i + 1}${post.postedAt ? ` (${post.postedAt.slice(0, 10)})` : ""}: ${redactPublicText(post.caption, instagram.handle).slice(0, 500)}`);
    });
  }
  return lines.join("\n");
}

export function postedInLast30Days(instagram: InstagramProfile | null, now: Date = new Date()): boolean {
  if (!instagram) return false;
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return instagram.captions.some((post) => {
    const at = post.postedAt ? Date.parse(post.postedAt) : NaN;
    return Number.isFinite(at) && at >= cutoff && at <= now.getTime() + 24 * 60 * 60 * 1000;
  });
}

// A first message is short (brief 14). The model is asked for this many
// words; a draft a few words over is still shown, anything longer is not.
export const MESSAGE_WORD_LIMIT = 55;
const MESSAGE_WORD_SLACK = 10;

export const ENRICHMENT_SYSTEM_PROMPT = `You help the two founders of PortPass Bahamas research Bahamian businesses that might want a page on PortPass. PortPass Bahamas gives a business a professional page with its prices, a "Message on WhatsApp" button, and one place to keep bookings and payment records. Customers pay the business directly by cash or bank transfer.

You are given only public information a business has published about itself. If the text mentions customers, children or any private individual, ignore them completely and never repeat a person's name other than the business's own name.

Record what you find with the record_lead tool. Be honest: when the text does not show something, say false or leave the field empty. Do not guess prices or facts.

For each signal, give a reason of one short sentence quoting or pointing to what you saw.
- books_by_dm: customers book only by WhatsApp, Instagram DM or phone (no online booking).
- publishes_prices: the business states at least one real price.
- high_value: a typical booking is $300 or more.
- real_demand: clear signs of demand, such as sold-out dates, waitlists, frequent "DM to book" replies, or many reviews.
- limited_inventory: a limited number of dates, seats, boats, rooms or coaches.
- online_booking: the business already takes bookings through an online booking system or checkout.

Then write first_message: a first WhatsApp message from Antonio at PortPass Bahamas to the business owner, to be sent by hand, one to one.
Rules for the message:
- ${MESSAGE_WORD_LIMIT} words or fewer, in short sentences. Warm, plain, Bahamian and confident. No hype.
- Open with a greeting and one specific thing you noticed about their business.
- Lead with the problem they already know they have (for example, answering the same price question all day, or not knowing if a date is free), as a question.
- Offer to build their page for them, free to try for 30 days. Ask if they would like to see it.
- Say "PortPass Bahamas", never just "PortPass".
- Never mention card payments, online payments or paying by card in any way.
- Never promise features, numbers of customers, or results. Never say "one-stop shop".
- Never include a link, a web address or an @account.
- Do not mention scores, research, AI, or that this message was drafted for Antonio.`;

export function enrichmentTool(sections: SectionOption[]) {
  const sectionSlugs = sections.map((s) => s.slug);
  const subsectionSlugs = sections.flatMap((s) => s.subcategories.map((c) => c.slug));
  const signalProperties: Record<string, { type: "boolean" }> = {};
  const reasonProperties: Record<string, { type: "string" }> = {};
  for (const key of AI_SIGNALS) {
    signalProperties[key] = { type: "boolean" };
    reasonProperties[key] = { type: "string" };
  }
  return {
    name: "record_lead",
    description: "Record what the public information shows about this business.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: ["string", "null"], enum: [...sectionSlugs, null], description: "The PortPass section this business belongs in, or null if none fits." },
        subsection: { type: ["string", "null"], enum: [...subsectionSlugs, null], description: "The subsection within that section, or null." },
        area: { type: ["string", "null"], description: "The neighbourhood or area, for example Cable Beach or Lyford Cay, if stated." },
        island: { type: ["string", "null"], description: "The island, for example New Providence, if stated or obvious from the address." },
        booking_method: { type: "string", enum: ["whatsapp_dm", "phone", "instagram_dm", "website_booking", "unknown"] },
        prices_mentioned: { type: ["string", "null"], description: "The prices the business states, copied as written, or null." },
        signals: { type: "object", properties: signalProperties, required: [...AI_SIGNALS] },
        signal_reasons: { type: "object", properties: reasonProperties },
        first_message: { type: "string" },
      },
      required: ["section", "subsection", "area", "island", "booking_method", "prices_mentioned", "signals", "first_message"],
    },
  };
}

export type Enrichment = {
  section: string | null;
  subsection: string | null;
  area: string | null;
  island: string | null;
  bookingMethod: BookingMethod;
  pricesText: string | null;
  signals: ScoreSignals;
  why: Partial<Record<ScoreSignalKey, string>>;
  message: string | null;
  messageProblem: string | null;
};

// Why a draft message is not shown: the Handbook's hard rules, checked in
// code so a model slip never reaches a founder's clipboard.
export function messageProblem(message: string): string | null {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return "The draft was empty.";
  if (/\b(cards?|credit|debit|visa|mastercard|stripe|apple pay|google pay|pa(y|id|ying|yments?) online|online pa(y|ying|yments?))\b/i.test(message)) return "The draft mentioned card or online payments, which PortPass does not offer.";
  if (/one[- ]stop shop/i.test(message)) return "The draft said \"one-stop shop\".";
  // A first message never carries a link or an account name: text copied
  // from a post could otherwise put someone else's address in it.
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|bs|ly|link|app)\b|@[A-Za-z0-9._]+)/i.test(message)) return "The draft contained a link or an account name.";
  if (words > MESSAGE_WORD_LIMIT + MESSAGE_WORD_SLACK) return "The draft was too long for a first message.";
  return null;
}

function cleanText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

// Validates the tool call. Anything outside the lists we offered (a made-up
// section, a booking method that doesn't exist) is dropped, not trusted.
export function parseEnrichment(raw: unknown, sections: SectionOption[]): Enrichment | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const section = sections.find((s) => s.slug === input.section) ?? null;
  const subsection = section?.subcategories.find((c) => c.slug === input.subsection) ?? null;
  const rawSignals = (input.signals && typeof input.signals === "object" ? input.signals : {}) as Record<string, unknown>;
  const rawReasons = (input.signal_reasons && typeof input.signal_reasons === "object" ? input.signal_reasons : {}) as Record<string, unknown>;
  const signals: ScoreSignals = {};
  const why: Partial<Record<ScoreSignalKey, string>> = {};
  for (const key of AI_SIGNALS) {
    signals[key] = rawSignals[key] === true;
    const reason = cleanText(rawReasons[key], 240);
    if (signals[key] && reason) why[key] = reason;
  }
  const draft = cleanText(input.first_message, 1200);
  const problem = draft ? messageProblem(draft) : "The draft was empty.";
  return {
    section: section?.slug ?? null,
    subsection: subsection?.slug ?? null,
    area: cleanText(input.area, 80),
    island: cleanText(input.island, 80),
    bookingMethod: isBookingMethod(input.booking_method) ? input.booking_method : "unknown",
    pricesText: cleanText(input.prices_mentioned, 600),
    signals,
    why,
    message: problem ? null : draft,
    messageProblem: problem,
  };
}

// The final score: the model's six signals plus the three we know ourselves.
export function scoreFromEnrichment(enrichment: Enrichment, known: { postedRecently: boolean; sectionWeFill: boolean; warmConnection: boolean }): { score: number; reasons: ScoreReason[] } {
  const signals: ScoreSignals = { ...enrichment.signals, posted_recently: known.postedRecently, section_we_fill: known.sectionWeFill, warm_connection: known.warmConnection };
  // A business that books online cannot also be "DM or phone only".
  if (signals.online_booking) signals.books_by_dm = false;
  return scoreLead(signals, enrichment.why);
}

export type EnrichResult =
  | { ok: true; enrichment: Enrichment; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: "not_configured" | "provider_error" | "bad_response"; status?: number };

export async function enrichWithClaude(subject: EnrichmentSubject, instagram: InstagramProfile | null, sections: SectionOption[], fetcher: typeof fetch = fetch): Promise<EnrichResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const model = scoutModel();
  const tool = enrichmentTool(sections);
  try {
    const response = await fetcher(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: ENRICHMENT_SYSTEM_PROMPT,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: `Here is the public information we have. Record it.\n\n${publicTextForAi(subject, instagram)}` }],
      }),
    });
    if (!response.ok) {
      console.error("scout enrichment failed", response.status);
      return { ok: false, reason: "provider_error", status: response.status };
    }
    const data = (await response.json()) as { content?: Array<{ type?: string; name?: string; input?: unknown }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const call = (data.content ?? []).find((block) => block.type === "tool_use" && block.name === tool.name);
    const enrichment = parseEnrichment(call?.input, sections);
    if (!enrichment) return { ok: false, reason: "bad_response" };
    return { ok: true, enrichment, model, inputTokens: Number(data.usage?.input_tokens) || 0, outputTokens: Number(data.usage?.output_tokens) || 0 };
  } catch (error) {
    console.error("scout enrichment threw", error instanceof Error ? error.message : "");
    return { ok: false, reason: "provider_error" };
  }
}
