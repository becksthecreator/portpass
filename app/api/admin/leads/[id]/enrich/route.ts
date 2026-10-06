import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { listSections } from "@/db/categories";
import { getLead, recordLookup, saveLeadEnrichment, sectionsWeAreFilling } from "@/db/leads";
import { requireAdminApi } from "@/lib/auth/admin";
import { enrichmentConfigured, enrichWithClaude, postedInLast30Days, scoreFromEnrichment } from "@/lib/scout/enrich";
import { instagramConfigured, lookupInstagram, type InstagramProfile } from "@/lib/scout/instagram";

type Ctx = { params: Promise<{ id: string }> };

// Admin -> Leads: the AI step for one lead (brief 14 §2). If the lead has
// an Instagram handle a founder typed and Business Discovery is set up,
// its public bio and last 12 captions are fetched first (one handle, one
// call). Then one Claude call, which is sent only what the business
// publishes: never a founder's notes, and only the posts about prices,
// booking or availability (lib/scout/enrich.ts). The result is stored with when it was
// generated and from which pages, so a founder can check it. Nothing is
// sent to the business.
// Per address, per server instance (Brief 21, part E): a stuck button or a
// script cannot hammer this.
const limited = createRateLimiter(60, 10 * 60_000);

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many lookups in a short time. Wait a few minutes." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!enrichmentConfigured()) return NextResponse.json({ error: "The AI step isn't set up yet (ANTHROPIC_API_KEY)." }, { status: 503 });

  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (lead.status === "do_not_contact") return NextResponse.json({ error: "This business asked not to be contacted." }, { status: 409 });

  let instagram: InstagramProfile | null = null;
  if (lead.instagramHandle && instagramConfigured()) {
    const lookup = await lookupInstagram(lead.instagramHandle);
    await recordLookup({ provider: "instagram", query: lead.instagramHandle, resultCount: lookup.ok ? lookup.profile.captions.length : 0, costMillicents: 0, ok: lookup.ok, actorUserId: auth.session.userId });
    if (lookup.ok) instagram = lookup.profile;
  }

  const sections = await listSections({ includeHidden: true });
  const result = await enrichWithClaude(
    {
      businessName: lead.businessName,
      whatTheyDo: lead.whatTheyDo,
      googleCategory: null,
      address: lead.address,
      websiteUrl: lead.websiteUrl,
      instagramHandle: lead.instagramHandle,
      knownBooking: lead.bookingMethod,
      knownPrices: lead.pricesText,
    },
    instagram,
    sections,
  );
  await recordLookup({ provider: "claude", query: lead.businessName, resultCount: result.ok ? result.inputTokens + result.outputTokens : 0, costMillicents: 0, ok: result.ok, actorUserId: auth.session.userId });
  if (!result.ok) return NextResponse.json({ error: "The AI step didn't answer. Try again in a minute." }, { status: 502 });

  // The section the lead will keep: a founder's choice wins over the AI's.
  const section = lead.section ?? result.enrichment.section;
  const filling = await sectionsWeAreFilling(sections.map((s) => s.slug));
  const { score, reasons } = scoreFromEnrichment(result.enrichment, {
    postedRecently: postedInLast30Days(instagram),
    sectionWeFill: section !== null && filling.has(section),
    warmConnection: lead.warmConnection,
  });

  try {
    const saved = await saveLeadEnrichment(id, {
      section: result.enrichment.section,
      subsection: result.enrichment.subsection,
      island: result.enrichment.island,
      area: result.enrichment.area,
      bookingMethod: result.enrichment.bookingMethod,
      pricesText: result.enrichment.pricesText,
      score,
      scoreReasons: reasons,
      draftMessage: result.enrichment.message,
      enrichment: { ...result.enrichment, instagram: instagram ? { handle: instagram.handle, followers: instagram.followers, posts: instagram.captions.length } : null },
      model: result.model,
      sourceUrls: [lead.websiteUrl, instagram?.profileUrl ?? null, lead.googleMapsUrl].filter((u): u is string => Boolean(u)),
    });
    return NextResponse.json({ lead: saved, messageProblem: result.enrichment.messageProblem });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Marked "do not contact" while the research was running: nothing is kept.
    if (message === "DO_NOT_CONTACT") return NextResponse.json({ error: "This business asked not to be contacted." }, { status: 409 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("lead enrich save", message);
    return NextResponse.json({ error: "Could not save the research." }, { status: 500 });
  }
}
