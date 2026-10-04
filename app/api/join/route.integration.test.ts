import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

// The founders' notification goes to a real inbox in production; here it is
// counted, never sent. Mocked before the route import so the route binds
// the stub.
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async () => "skipped"),
}));

import { POST } from "./route";
import { eventSignupCounts, getLead, listLeads, updateLead } from "@/db/leads";
import { sendEmail } from "@/lib/email";

// The event sign-up form (brief 18, part C) against CI's local Supabase
// stack. Every business is "TEST delete" with a 242-555-01xx number, and
// every row is removed afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
const MARK = `TEST delete ${TAG}`;
const EVENT = `test-fair-${TAG}`;

let actor = "";
async function actorId(): Promise<string> {
  if (actor) return actor;
  const { data, error } = await db().auth.admin.createUser({ email: `test-delete-join-${TAG}@test.portpass.local`, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create the test user: ${error?.message}`);
  actor = data.user.id;
  return actor;
}

let address = 0;
function post(payload: Record<string, unknown>, from = `10.9.${Math.floor(address / 250)}.${(address++ % 250) + 1}`) {
  return POST(new Request("https://portpass.test/api/join", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": from }, body: JSON.stringify(payload) }));
}

let serial = 0;
function signup(name: string, over: Record<string, unknown> = {}) {
  serial += 1;
  return { event: EVENT, name: "Test Owner", businessName: `${MARK} ${name}`, whatsapp: `242-555-${String(1000 + serial).slice(-4)}`, section: "entertainment", instagram: "", whatsappConsent: true, ...over };
}

async function leadNamed(name: string) {
  const { data } = await db().from("leads").select("id,status,source,event_code,contact_name,whatsapp_consent,whatsapp_consent_at,whatsapp_e164,section,instagram_handle").eq("business_name", `${MARK} ${name}`).maybeSingle();
  return data;
}

afterAll(async () => {
  const { data } = await db().from("leads").select("id").like("business_name", `${MARK}%`);
  const ids = (data ?? []).map((row) => String(row.id));
  if (ids.length) await db().from("audit_log").delete().eq("target_table", "leads").in("target_id", ids);
  await db().from("leads").delete().like("business_name", `${MARK}%`);
  if (actor) await db().from("audit_log").delete().eq("actor_user_id", actor);
  if (actor) await db().auth.admin.deleteUser(actor);
});

describe("POST /api/join", () => {
  it("makes a New lead with the event, the name and the consent, and tells the founders only", async () => {
    const response = await post(signup("Harbour Tours", { instagram: "@Harbour.Tours" }));
    expect(response.status).toBe(201);
    const lead = await leadNamed("Harbour Tours");
    expect(lead).toMatchObject({ status: "new", source: "event", event_code: EVENT, contact_name: "Test Owner", whatsapp_consent: true, section: "entertainment", instagram_handle: "harbour.tours" });
    expect(lead?.whatsapp_consent_at).toBeTruthy();
    expect(String(lead?.whatsapp_e164)).toMatch(/^\+1242555\d{4}$/);

    // One email, to PortPass itself; nothing addressed to the person.
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sent.to).toMatch(/@/);
    expect(sent.to).not.toContain("555");
    expect(sent.html).toContain(`/admin/leads/${lead?.id}`);
    expect(sent.html).not.toMatch(/\+1242555\d{4}/);
  });

  it("records no consent when the box was not ticked", async () => {
    expect((await post(signup("No Tick Rentals", { whatsappConsent: false }))).status).toBe(201);
    expect(await leadNamed("No Tick Rentals")).toMatchObject({ whatsapp_consent: false, whatsapp_consent_at: null });
  });

  it("refuses a sign-up with a bad number, no section or a bad event, and saves nothing", async () => {
    expect((await post(signup("Bad Number", { whatsapp: "12" }))).status).toBe(400);
    expect((await post(signup("Bad Section", { section: "nope" }))).status).toBe(400);
    expect((await post(signup("Bad Event", { event: "../admin" }))).status).toBe(400);
    for (const name of ["Bad Number", "Bad Section", "Bad Event"]) expect(await leadNamed(name)).toBeNull();
  });

  it("keeps one row for a business that signs up twice, and never takes consent away", async () => {
    expect((await post(signup("Twice Catering"))).status).toBe(201);
    const first = await leadNamed("Twice Catering");
    await updateLead(Number(first?.id), { status: "contacted" }, await actorId());
    expect((await post(signup("twice  catering.", { name: "Second Person", whatsappConsent: false }))).status).toBe(201);
    const { data } = await db().from("leads").select("id,status,contact_name,whatsapp_consent,whatsapp_e164").ilike("business_name", `${MARK} twice%catering%`);
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ id: first?.id, status: "contacted", contact_name: "Second Person", whatsapp_consent: true, whatsapp_e164: first?.whatsapp_e164 });
  });

  it("leaves a 'do not contact' business alone, with the same answer", async () => {
    expect((await post(signup("Left Alone Ltd"))).status).toBe(201);
    const lead = await leadNamed("Left Alone Ltd");
    await updateLead(Number(lead?.id), { status: "do_not_contact" }, await actorId());
    vi.mocked(sendEmail).mockClear();
    const response = await post(signup("Left Alone Ltd", { name: "Someone Else" }));
    expect(response.status).toBe(201);
    expect(await getLead(Number(lead?.id))).toMatchObject({ status: "do_not_contact", contactName: null, whatsappE164: null, whatsappConsent: false });
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("stops one number being entered over and over", async () => {
    const one = signup("Repeat One");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post({ ...one, businessName: `${MARK} Repeat ${i}` })).status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(4);
    expect(statuses.slice(4)).toEqual([429, 429]);
  });

  it("shows in Admin -> Leads under its event, and in the count", async () => {
    const listed = await listLeads({ event: EVENT });
    expect(listed.length).toBeGreaterThanOrEqual(3);
    expect(listed.every((lead) => lead.eventCode === EVENT && lead.status !== "do_not_contact")).toBe(true);
    const count = (await eventSignupCounts()).find((entry) => entry.event === EVENT);
    expect(count?.count).toBe(listed.length);
    expect(count?.fresh).toBe(listed.filter((lead) => lead.status === "new").length);
  });

  // Brief 18, C5: a room signing up at once. 100 sign-ups from one Wi-Fi
  // address, ten at a time, with no error and one lead each.
  it("takes 100 sign-ups from one address without an error", async () => {
    const started = Date.now();
    const statuses: number[] = [];
    for (let batch = 0; batch < 10; batch++) {
      const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => post(signup(`Room ${batch * 10 + i}`, { event: `${EVENT}-room` }), "10.8.0.1")));
      statuses.push(...responses.map((response) => response.status));
    }
    const seconds = (Date.now() - started) / 1000;
    console.log(`event sign-ups: 100 submissions in ${seconds.toFixed(1)}s, statuses ${JSON.stringify([...new Set(statuses)])}`);
    expect(statuses.every((status) => status === 201)).toBe(true);
    expect((await listLeads({ event: `${EVENT}-room` })).length).toBe(100);
  }, 120_000);
});
