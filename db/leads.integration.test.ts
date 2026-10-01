import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { emptyLeadDraft, parseTrackerCsv } from "@/lib/scout/leads";
import { createApplication } from "./applications";
import { listSections } from "./categories";
import { createLead, draftPageFromLead, existingForPlaces, getLead, importLeads, leadsDigest, listLeads, lookupUsage, nassauToday, noteInboundRequest, PLACES_DAILY_CAP, recordLookup, removeInboundLead, saveLeadEnrichment, updateLead } from "./leads";

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
  await db().from("applications").delete().like("organization_name", `${MARK}%`);
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
    // Under a new name with no handle, the same phone number still gives it away.
    expect(await createLead(draft("A Brand New Name", { phone: "(242) 555-0123" }), { actorUserId: actor })).toMatchObject({ ok: false, reason: "do_not_contact" });
    // A Google search shows it as "do not contact" too, whatever Google calls it.
    const seen = await existingForPlaces([{ placeId: `ChIJtest${TAG}0001`, name: `${MARK} Fotobooth Co`, phone: "(242) 555-0123", internationalPhone: "+1 242-555-0123", websiteUrl: null }]);
    expect(seen.get(`ChIJtest${TAG}0001`)).toMatchObject({ status: "do_not_contact" });

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

    // A later sheet marks an open lead "do not contact": the request wins.
    const open = await createLead(draft("Open Then Closed", { phone: "242-555-0177", whatsappE164: "+12425550177" }), { actorUserId: actor });
    expect(open.ok).toBe(true);
    const later = parseTrackerCsv(["Business,Status,Do not contact", `${MARK} Open Then Closed,Not contacted,Yes`].join("\n"), sections);
    const third = await importLeads(later.drafts, actor);
    expect(third).toMatchObject({ added: 0, duplicates: [], doNotContact: [`${MARK} Open Then Closed`] });
    expect((await db().from("leads").select("status,phone,whatsapp_e164").eq("business_name", `${MARK} Open Then Closed`).single()).data).toEqual({ status: "do_not_contact", phone: null, whatsapp_e164: null });
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
    expect(contacted.lastContactOn).toBe(nassauToday());

    // A second research pass whose draft was thrown away keeps the message on file.
    const again = await saveLeadEnrichment(made.lead.id, { score: 60, scoreReasons: [{ key: "books_by_dm", label: "Books by WhatsApp, DM or phone only", points: 25 }], draftMessage: null, enrichment: {}, model: "test-model", sourceUrls: [] });
    expect(again.draftMessage).toBe("Hi from PortPass Bahamas.");
  });

  it("re-scores when a founder marks a warm connection or corrects how the business books", async () => {
    const made = await createLead(draft("Warm Tours", { section: "tours" }), { actorUserId: await actorId() });
    if (!made.ok) throw new Error("lead not created");
    await saveLeadEnrichment(made.lead.id, {
      score: 40, scoreReasons: [{ key: "books_by_dm", label: "Books by WhatsApp, DM or phone only", points: 25 }, { key: "publishes_prices", label: "Publishes prices", points: 15 }],
      draftMessage: null, enrichment: {}, model: "test-model", sourceUrls: [],
    });
    const warm = await updateLead(made.lead.id, { warmConnection: true }, actor);
    expect(warm.score).toBe(50);
    expect(warm.scoreReasons.map((r) => r.key)).toContain("warm_connection");
    const online = await updateLead(made.lead.id, { bookingMethod: "website_booking" }, actor);
    // 15 (prices) + 10 (warm) - 30 (books online already), never below 0.
    expect(online.score).toBe(0);
    expect(online.scoreReasons.map((r) => r.key)).not.toContain("books_by_dm");
    // A tracker score with no reasons behind it is left as it is.
    const tracker = await createLead(draft("Tracker Number", { score: 82 }), { actorUserId: actor });
    if (!tracker.ok) throw new Error("lead not created");
    expect((await updateLead(tracker.lead.id, { warmConnection: true }, actor)).score).toBe(82);
  });
});

describe("the get listed form and leads", () => {
  it("moves an existing lead to Replied instead of dropping the request, and never touches a tombstone", async () => {
    const made = await createLead(draft("Asked Twice", { whatsappE164: "+12425550155", phone: "+12425550155" }), { actorUserId: await actorId() });
    if (!made.ok) throw new Error("lead not created");
    const application = await createApplication({ organizationName: `${MARK} Asked Twice`, contactPerson: `${MARK} Owner`, section: "entertainment", whatsappE164: "+12425550199", instagramHandle: null, note: null, utmSource: null, utmMedium: null, utmCampaign: null, planCode: null, referralCode: "FUTPREP" });
    await noteInboundRequest(made.lead.id, { applicationId: application.id, referralCode: "FUTPREP" });
    const noted = await getLead(made.lead.id);
    // The number a founder recorded stays; the form's number is on the application.
    expect(noted).toMatchObject({ status: "replied", applicationId: application.id, referralCode: "FUTPREP", whatsappE164: "+12425550155", lastContactOn: nassauToday() });

    await updateLead(made.lead.id, { status: "do_not_contact" }, actor);
    await noteInboundRequest(made.lead.id, { applicationId: application.id, referralCode: null });
    expect((await db().from("leads").select("status").eq("id", made.lead.id).single()).data).toEqual({ status: "do_not_contact" });
  });

  it("lets a founder remove a junk request from the public form, and nothing else", async () => {
    const junk = await createLead({ ...emptyLeadDraft(`${MARK} Junk Request`, "inbound_form"), status: "replied" }, { actorUserId: null });
    const kept = await createLead(draft("Kept By A Founder"), { actorUserId: await actorId() });
    if (!junk.ok || !kept.ok) throw new Error("lead not created");
    await expect(removeInboundLead(kept.lead.id, actor)).rejects.toThrow("NOT_REMOVABLE");
    await removeInboundLead(junk.lead.id, actor);
    expect(await getLead(junk.lead.id)).toBeNull();
    // Removed outright, with no tombstone: the same name can be added again.
    expect((await createLead(draft("Junk Request"), { actorUserId: actor })).ok).toBe(true);
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
