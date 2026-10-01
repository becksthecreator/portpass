import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { emptyLeadDraft, parseTrackerCsv } from "@/lib/scout/leads";
import { listSections } from "./categories";
import { createLead, draftPageFromLead, getLead, importLeads, leadsDigest, listLeads, lookupUsage, PLACES_DAILY_CAP, recordLookup, saveLeadEnrichment, updateLead } from "./leads";

// PortPass Scout (brief 14) against CI's local Supabase stack. Every lead
// is "TEST — delete" and removed afterwards, with the draft business one
// of them creates.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST delete ${TAG}`;
let actor = "";
const madeOrganizations: number[] = [];

async function actorId(): Promise<string> {
  if (actor) return actor;
  const { data, error } = await db().auth.admin.createUser({ email: `test-delete-scout-${TAG}@test.portpass.local`, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create the test user: ${error?.message}`);
  actor = data.user.id;
  return actor;
}

afterAll(async () => {
  await db().from("leads").delete().like("business_name", `${MARK}%`);
  await db().from("scout_lookups").delete().like("query", `${MARK}%`);
  // The audit rows name the test user and the draft business, so they go first.
  if (actor) await db().from("audit_log").delete().eq("actor_user_id", actor);
  for (const id of madeOrganizations) await db().from("organizations").delete().eq("id", id);
  if (actor) await db().auth.admin.deleteUser(actor);
});

function draft(name: string, over: Partial<ReturnType<typeof emptyLeadDraft>> = {}) {
  return { ...emptyLeadDraft(`${MARK} ${name}`, "founder"), section: "entertainment", ...over };
}

describe("one row per business", () => {
  it("adds a lead once, and refuses the same business again however it is spelt", async () => {
    const first = await createLead(draft("Party Rentals", { instagramHandle: `test_rentals_${TAG}`, score: 55 }), { actorUserId: await actorId() });
    expect(first.ok).toBe(true);
    const again = await createLead(draft("party  rentals."), { actorUserId: actor });
    expect(again).toMatchObject({ ok: false, reason: "duplicate" });
    const byHandle = await createLead(draft("A Different Name", { instagramHandle: `@Test_Rentals_${TAG}` }), { actorUserId: actor });
    expect(byHandle).toMatchObject({ ok: false, reason: "duplicate" });
  });
});

describe("do not contact is permanent", () => {
  it("wipes the contact details, hides the lead from every list, and blocks adding it again", async () => {
    const made = await createLead(draft("Photo Booths", { phone: "242-555-0123", whatsappE164: "+12425550123", email: "owner@testbooths.example", notes: "TEST note", instagramHandle: `test_booths_${TAG}` }), { actorUserId: await actorId() });
    if (!made.ok) throw new Error("lead not created");
    const closed = await updateLead(made.lead.id, { status: "do_not_contact" }, actor);
    expect(closed).toMatchObject({ status: "do_not_contact", phone: null, whatsappE164: null, email: null, notes: null, draftMessage: null, score: null });

    expect((await listLeads({ status: "all" })).some((l) => l.id === made.lead.id)).toBe(false);
    expect((await listLeads({ q: "Photo Booths" })).some((l) => l.id === made.lead.id)).toBe(false);
    expect((await leadsDigest()).topUncontacted.some((l) => l.id === made.lead.id)).toBe(false);

    await expect(updateLead(made.lead.id, { status: "new" }, actor)).rejects.toThrow("DO_NOT_CONTACT");
    await expect(draftPageFromLead(made.lead.id, actor)).rejects.toThrow("DO_NOT_CONTACT");
    await expect(saveLeadEnrichment(made.lead.id, { score: 90, scoreReasons: [], draftMessage: "Hi", enrichment: {}, model: "test", sourceUrls: [] })).rejects.toThrow("DO_NOT_CONTACT");

    expect(await createLead(draft("Photo Booths"), { actorUserId: actor })).toMatchObject({ ok: false, reason: "do_not_contact" });
    expect(await createLead(draft("Renamed Booths", { instagramHandle: `test_booths_${TAG}` }), { actorUserId: actor })).toMatchObject({ ok: false, reason: "do_not_contact" });

    const audit = await db().from("audit_log").select("action").eq("actor_user_id", actor).eq("target_id", String(made.lead.id));
    expect((audit.data ?? []).map((row) => row.action)).toContain("lead.do_not_contact");
  });
});

describe("the Prospect Tracker import", () => {
  it("brings in statuses and scores, and running it twice adds nothing", async () => {
    const sections = await listSections({ includeHidden: true });
    const csv = [
      "#,Section,Subcategory,Business,What they do,How they book today,Online payment today,Instagram,Phone / WhatsApp,Email,Website,Why a good fit,Priority,Status,Owner,Next step,Last contact,Notes,Source,Lead score (0-100),Source,Date added,Do not contact",
      `1,Entertainment,DJs,${MARK} DJ One,Weddings and parties,WhatsApp,No,,242-555-0101,,,Books by WhatsApp,1,Contacted,Antonio,Send preview,2026-09-20,,Hand research,82,,,`,
      `2,Entertainment,DJs,${MARK} DJ Two,Corporate events,Phone,No,,,,,,2,Not contacted,,,,,,45,,,`,
      `3,Entertainment,DJs,${MARK} DJ Three,Said no in September,Phone,No,,242-555-0103,,,,3,Not now,,,,,,,,,Yes`,
    ].join("\n");
    const { drafts } = parseTrackerCsv(csv, sections);
    expect(drafts).toHaveLength(3);
    const first = await importLeads(drafts, await actorId());
    expect(first).toMatchObject({ added: 3, duplicates: [], doNotContact: [], failed: [] });

    const listed = (await listLeads({ q: `${MARK} DJ` })).sort((a, b) => a.businessName.localeCompare(b.businessName));
    expect(listed.map((l) => [l.businessName, l.status, l.score])).toEqual([[`${MARK} DJ One`, "contacted", 82], [`${MARK} DJ Two`, "new", 45]]);
    expect(listed[0]).toMatchObject({ section: "entertainment", bookingMethod: "whatsapp_dm", whatsappE164: "+12425550101", source: "tracker_import", lastContactOn: "2026-09-20" });

    // The "do not contact" row came in as a tombstone: no phone kept.
    const { data: tombstone } = await db().from("leads").select("status,phone,whatsapp_e164").eq("business_name", `${MARK} DJ Three`).single();
    expect(tombstone).toEqual({ status: "do_not_contact", phone: null, whatsapp_e164: null });

    const second = await importLeads(drafts, actor);
    expect(second.added).toBe(0);
    expect(second.duplicates).toHaveLength(2);
    expect(second.doNotContact).toEqual([`${MARK} DJ Three`]);
  });
});

describe("filters and the weekly digest", () => {
  it("filters by section, score, status and source, and lists the top uncontacted by score", async () => {
    await createLead(draft("Sailing Days", { section: "tours", score: 91, area: "Montagu" }), { actorUserId: await actorId() });
    const top = (await listLeads({ minScore: 70 })).filter((l) => l.businessName.startsWith(MARK));
    expect(top.map((l) => l.businessName).sort()).toEqual([`${MARK} DJ One`, `${MARK} Sailing Days`]);
    expect((await listLeads({ section: "tours", q: MARK })).map((l) => l.businessName)).toEqual([`${MARK} Sailing Days`]);
    expect((await listLeads({ area: "montagu", q: MARK })).map((l) => l.businessName)).toEqual([`${MARK} Sailing Days`]);
    expect((await listLeads({ status: "contacted", q: MARK })).map((l) => l.businessName)).toEqual([`${MARK} DJ One`]);
    expect((await listLeads({ source: "tracker_import", q: MARK })).length).toBe(2);

    const digest = await leadsDigest();
    const mine = digest.topUncontacted.filter((l) => l.businessName.startsWith(MARK)).map((l) => l.businessName);
    // DJ One is already contacted, so it is not in the "not yet contacted" list.
    expect(mine).toContain(`${MARK} Sailing Days`);
    expect(mine).not.toContain(`${MARK} DJ One`);
    expect(digest.newThisWeek).toBeGreaterThanOrEqual(4);
  });
});

describe("the AI step's result and the status flow", () => {
  it("stores score, reasons, message and sources, without overwriting what a founder typed", async () => {
    const made = await createLead(draft("Charters", { section: "tours", area: "Paradise Island", websiteUrl: "https://testcharters.example" }), { actorUserId: await actorId() });
    if (!made.ok) throw new Error("lead not created");
    const saved = await saveLeadEnrichment(made.lead.id, {
      section: "entertainment", area: "Somewhere else", island: "New Providence", bookingMethod: "whatsapp_dm", pricesText: "Half day $600",
      score: 75, scoreReasons: [{ key: "books_by_dm", label: "Books by WhatsApp, DM or phone only", points: 25, why: "Bio says WhatsApp to book" }],
      draftMessage: "Hi from PortPass Bahamas.", enrichment: { test: true }, model: "test-model", sourceUrls: ["https://testcharters.example", "https://www.instagram.com/test_charters/"],
    });
    expect(saved).toMatchObject({ section: "tours", area: "Paradise Island", island: "New Providence", bookingMethod: "whatsapp_dm", pricesText: "Half day $600", score: 75, draftMessage: "Hi from PortPass Bahamas.", enrichmentModel: "test-model", status: "new" });
    expect(saved.enrichedAt).not.toBeNull();
    expect(saved.sourceUrls).toEqual(["https://testcharters.example/", "https://www.instagram.com/test_charters/"]);

    const contacted = await updateLead(made.lead.id, { status: "contacted" }, actor);
    expect(contacted.lastContactOn).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("draft their page", () => {
  it("creates an unpublished draft business and links it; never publishes", async () => {
    const made = await createLead(draft("Sound Hire", { whatTheyDo: "Speakers and microphones for events", whatsappE164: "+12425550144", phone: "+12425550144", instagramHandle: `test_sound_${TAG}` }), { actorUserId: await actorId() });
    if (!made.ok) throw new Error("lead not created");
    const result = await draftPageFromLead(made.lead.id, actor);
    madeOrganizations.push(result.organizationId);
    expect(result.lead).toMatchObject({ status: "page_drafted", organizationId: result.organizationId });

    const { data: org } = await db().from("organizations").select("name,status,is_published,is_directory_listed,created_by_admin,primary_category,whatsapp_e164,instagram_handle").eq("id", result.organizationId).single();
    expect(org).toMatchObject({ name: `${MARK} Sound Hire`, status: "draft", is_published: false, is_directory_listed: false, created_by_admin: true, primary_category: "entertainment", whatsapp_e164: "+12425550144", instagram_handle: `test_sound_${TAG}` });

    await expect(draftPageFromLead(made.lead.id, actor)).rejects.toThrow("ALREADY_DRAFTED");
    const noSection = await createLead({ ...draft("No Section Yet"), section: null }, { actorUserId: actor });
    if (!noSection.ok) throw new Error("lead not created");
    await expect(draftPageFromLead(noSection.lead.id, actor)).rejects.toThrow("SECTION_REQUIRED");
    expect((await getLead(noSection.lead.id))?.organizationId).toBeNull();
  });
});

describe("lookups: the daily cap and the spend", () => {
  it("counts today's Google searches and this month's estimated cost", async () => {
    const before = await lookupUsage();
    await recordLookup({ provider: "google_places", query: `${MARK} party rentals Nassau`, resultCount: 12, costMillicents: 3500, ok: true, actorUserId: await actorId() });
    await recordLookup({ provider: "google_places", query: `${MARK} djs Nassau`, resultCount: 8, costMillicents: 3500, ok: true, actorUserId: actor });
    await recordLookup({ provider: "claude", query: `${MARK} DJ One`, resultCount: 1050, costMillicents: 0, ok: true, actorUserId: actor });
    const after = await lookupUsage();
    expect(after.placesToday - before.placesToday).toBe(2);
    expect(after.placesLeftToday).toBe(Math.max(0, PLACES_DAILY_CAP - after.placesToday));
    expect(after.monthCount.claude - before.monthCount.claude).toBe(1);
    // Two searches at $0.035 each: 7 cents.
    expect(after.monthCostCents.google_places - before.monthCostCents.google_places).toBe(7);
  });
});
