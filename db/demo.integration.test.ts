import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The demo's guards read the demo session through next/headers, which only
// exists inside a Next request; a tiny in-memory jar stands in for it.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

import { getAdminOverview } from "./adminStats";
import { listAdminBookings } from "./adminBookings";
import { listAdminBusinesses } from "./adminBusinesses";
import { listAdminPayments } from "./adminPayments";
import { getBusinessSessionRoster, listBusinessSessions, markBusinessAttendance } from "./businessAttendance";
import { getBusinessRegistration, listBusinessRegistrations } from "./businessRegistrations";
import { DEMO_SLUG, ensureDemoBusiness, forgetDemoBusiness, getDemoBusiness, resetDemoBusiness } from "./demo";
import { getGrowthReport } from "./growth";
import { getOrganizationListingBySlug, getOrganizationListingForPreview, listCategoryOrganizations, listPublishedOrganizations, listSectionBusinesses } from "./organizations";
import { customerSaysPaid, getPaymentRequest, getPublicPaymentRequest, listPaymentRequests, listPaymentSetup, markPaymentRequestSent, paymentVolumeReport, recordRequestPayment } from "./paymentRequests";
import { getRegistrationBusiness } from "./registrationBusiness";
import { getSiteVisits } from "./siteVisits";
import { currentDemo, requireDemoApi } from "@/lib/auth/demo";
import { requireOrgRoleApi, requirePlatformRoleApi, requireSignedInApi } from "@/lib/auth/guards";
import { DEMO_COOKIE, issueDemoToken } from "@/lib/demoSession";
import { nassauToday } from "@/lib/futprepTerms";
import { DEMO_ACTOR, paymentsApiAccess } from "@/lib/paymentRequests/access";
import { chaseList } from "@/lib/paymentRequests/rules";

// The demo business (brief 18, part B) against CI's local Supabase stack:
// what it holds, that it can never be public or counted with real
// businesses, that nothing in it reaches anyone, and that a demo session
// opens the demo and nothing else.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const TAG = crypto.randomUUID().slice(0, 6);
let demoId = 0;
let realOrgId = 0;

beforeAll(async () => {
  demoId = await resetDemoBusiness();
  // A real (TEST) business, to prove the demo session can't open it.
  const { data, error } = await db().from("organizations").insert({ name: `TEST delete Real Biz ${TAG}`, slug: `test-delete-real-${TAG}`, status: "draft", primary_category: "entertainment" }).select("id").single();
  if (error || !data) throw new Error(`Could not make the test business: ${error?.message}`);
  realOrgId = Number(data.id);
});

afterAll(async () => {
  jar.clear();
  if (realOrgId) await db().from("organizations").delete().eq("id", realOrgId);
  // The demo is left as CI's stack found it after a reset: it is part of
  // the product, and the stack is thrown away.
});

describe("what the demo holds", () => {
  it("is Harbour Kids Club (Demo), with two programmes and three offerings", async () => {
    const demo = await getDemoBusiness();
    expect(demo).toMatchObject({ id: demoId, slug: DEMO_SLUG, name: "Harbour Kids Club (Demo)" });
    expect(demo?.resetAt).toBeTruthy();
    const [{ count: programs }, { count: offerings }] = await Promise.all([
      db().from("programs").select("id", { count: "exact", head: true }).eq("organization_id", demoId),
      db().from("offerings").select("id", { count: "exact", head: true }).eq("organization_id", demoId),
    ]);
    expect(programs).toBe(2);
    expect(offerings).toBe(3);
    const listing = await getOrganizationListingForPreview(demoId);
    expect(listing?.offerings).toHaveLength(3);
    expect(listing?.organization.whatsappE164 ?? null).toBeNull();
  });

  it("has invented people only: 242-555-01xx numbers, example.com emails, and no health detail for any child", async () => {
    const { data } = await db()
      .from("registrations")
      .select("child_name,child_dob,parent_email,parent_phone,emergency_contact_name,emergency_contact_phone,allergies,medical_conditions,medications,special_needs,authorized_pickup")
      .eq("organization_id", demoId);
    expect(data?.length).toBe(22);
    for (const row of data ?? []) {
      expect(row.parent_email).toMatch(/^[a-z]+\.[a-z]+@example\.com$/);
      expect(row.parent_phone).toMatch(/^\+124255501\d{2}$/);
      expect(row.child_dob).toBeNull();
      for (const field of ["emergency_contact_name", "emergency_contact_phone", "allergies", "medical_conditions", "medications", "special_needs", "authorized_pickup"] as const) expect(row[field] ?? "").toBe("");
    }
    const { data: requests } = await db().from("payment_requests").select("customer_email,customer_phone").eq("organization_id", demoId);
    for (const row of requests ?? []) {
      expect(row.customer_email).toMatch(/@example\.com$/);
      expect(row.customer_phone).toMatch(/^\+124255501\d{2}$/);
    }
  });

  it("has requests that are paid, part paid, overdue and not yet sent, and a chase list", async () => {
    const requests = await listPaymentRequests(demoId);
    expect(requests).toHaveLength(14);
    const count = (status: string) => requests.filter((r) => r.status === status).length;
    expect(count("paid")).toBe(5);
    expect(count("part_paid")).toBe(2);
    expect(count("draft")).toBe(2);
    const overdue = chaseList(requests, nassauToday());
    expect(overdue.length).toBeGreaterThanOrEqual(4);
    // Paid requests were paid in the past, each with a receipt.
    const paid = requests.find((r) => r.status === "paid")!;
    const found = await getPaymentRequest(demoId, paid.id);
    expect(found?.payments[0].receiptNumber).toMatch(/^HKC-R\d{4}$/);
    expect(new Date(paid.paidAt!).getTime()).toBeLessThan(Date.now() - 10 * 24 * 60 * 60 * 1000);
  });

  it("has three Saturdays of attendance, and a register left to mark", async () => {
    const today = nassauToday();
    const sessions = await listBusinessSessions(demoId, today);
    const saturdays = sessions.filter((s) => s.programName === "Saturday Kids Club" && s.date < today);
    expect(saturdays).toHaveLength(3);
    for (const s of saturdays) expect(s.marked).toBe(7);
    const art = sessions.filter((s) => s.programName === "After-School Art Club" && s.date < today);
    expect(art.length).toBeGreaterThanOrEqual(1);
    // The newest one is left for the visitor; the ones before it are done.
    expect(art[0].marked).toBe(0);
    expect(art[0].expected).toBe(5);
    for (const s of art.slice(1)) expect(s.marked).toBe(4);
  });

  it("fills the growth report: this term, last term, visits and money", async () => {
    const report = await getGrowthReport({ id: demoId, name: "Harbour Kids Club (Demo)" });
    expect(report.current).not.toBeNull();
    expect(report.previous).not.toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/allerg|medical|emergency|pickup/i);
  });

  it("goes back to the same starting point, keeping its id", async () => {
    const [request] = (await listPaymentRequests(demoId)).filter((r) => r.status === "draft");
    await markPaymentRequestSent(demoId, request.id, "whatsapp_link", DEMO_ACTOR);
    expect((await listPaymentRequests(demoId)).filter((r) => r.status === "draft")).toHaveLength(1);
    expect(await resetDemoBusiness()).toBe(demoId);
    expect((await listPaymentRequests(demoId)).filter((r) => r.status === "draft")).toHaveLength(2);
    expect(await listBusinessRegistrations(demoId)).toHaveLength(22);
    // A fresh demo is left alone; only a stale one is written again.
    expect((await ensureDemoBusiness()).id).toBe(demoId);
  });
});

describe("the demo is never public", () => {
  it("is in no listing, section, search source or registration form", async () => {
    expect((await listPublishedOrganizations()).some((o) => o.slug === DEMO_SLUG)).toBe(false);
    expect((await listSectionBusinesses("sports-fitness")).some((o) => o.slug === DEMO_SLUG)).toBe(false);
    expect((await listCategoryOrganizations("sports-fitness")).some((o) => o.slug === DEMO_SLUG)).toBe(false);
    expect(await getOrganizationListingBySlug(DEMO_SLUG)).toBeNull();
    expect(await getRegistrationBusiness(DEMO_SLUG)).toBeNull();
  });

  it("can't be published, listed, approved or given a domain: the database refuses", async () => {
    for (const change of [{ is_published: true }, { is_directory_listed: true }, { status: "approved" }, { status: "live" }, { custom_domain: `demo-${TAG}.example.com` }]) {
      const { error } = await db().from("organizations").update(change).eq("id", demoId);
      expect(error, JSON.stringify(change)).not.toBeNull();
    }
    const { data } = await db().from("organizations").select("is_published,is_directory_listed,status,custom_domain").eq("id", demoId).single();
    expect(data).toEqual({ is_published: false, is_directory_listed: false, status: "draft", custom_domain: null });
  });

  it("there is only ever one demo", async () => {
    const { error } = await db().from("organizations").insert({ name: `TEST delete second demo ${TAG}`, slug: `test-delete-demo-${TAG}`, status: "draft", is_demo: true });
    expect(error).not.toBeNull();
  });
});

describe("the demo is never counted with real businesses", () => {
  it("is not in Admin -> Businesses, Bookings, Payments, the volume report or who-can-be-paid", async () => {
    expect((await listAdminBusinesses()).some((b) => b.id === demoId)).toBe(false);
    expect((await listAdminBookings({ limit: 5000 })).some((b) => b.organizationId === demoId)).toBe(false);
    expect((await listAdminBookings({ owing: true })).some((b) => b.organizationId === demoId)).toBe(false);
    expect((await listAdminPayments()).some((p) => p.organizationId === demoId)).toBe(false);
    const volume = await paymentVolumeReport();
    expect(volume.rows.some((row) => row.organizationId === demoId)).toBe(false);
    expect((await listPaymentSetup()).some((row) => row.organizationId === demoId)).toBe(false);
  });

  it("adds nothing to the Overview's registrations, payments or page views", async () => {
    // Every demo row made this week is taken out; what is left is whatever
    // the other tests' TEST businesses have, with or without a demo.
    const before = await getAdminOverview();
    const visitsBefore = await getSiteVisits(before.since);
    await db().from("organizations").update({ is_demo: false }).eq("id", demoId);
    forgetDemoBusiness();
    // (No longer the demo: now its rows count.)
    const counted = await getAdminOverview();
    const visitsCounted = await getSiteVisits(counted.since);
    await db().from("organizations").update({ is_demo: true }).eq("id", demoId);
    forgetDemoBusiness();
    expect(counted.thisWeek.registrations! - before.thisWeek.registrations!).toBeGreaterThanOrEqual(4);
    expect(counted.thisWeek.paymentsCents! - before.thisWeek.paymentsCents!).toBeGreaterThanOrEqual(6000);
    expect(visitsCounted.views - visitsBefore.views).toBeGreaterThanOrEqual(30);
    expect(visitsBefore.topPages.some((page) => page.path.includes(DEMO_SLUG))).toBe(false);
  });

  it("writes nothing to the audit trail", async () => {
    const [request] = (await listPaymentRequests(demoId)).filter((r) => r.status === "sent");
    await recordRequestPayment(demoId, request.id, { amountCents: request.totalCents - request.paidCents, method: "cash", receivedAt: new Date().toISOString(), reference: "", note: "" }, DEMO_ACTOR);
    const { count } = await db().from("audit_log").select("id", { count: "exact", head: true }).eq("organization_id", demoId);
    expect(count).toBe(0);
  });
});

describe("nothing a visitor types is kept", () => {
  it("keeps the customer's 'I've paid' tap, not the words", async () => {
    const [request] = (await listPaymentRequests(demoId)).filter((r) => r.status === "sent" && !r.customerSaysPaidAt);
    expect(await customerSaysPaid(request.publicToken, "call me on 242-555-9999, my name is Real Person")).toBe("flagged");
    const found = await getPaymentRequest(demoId, request.id);
    expect(found?.request.customerSaysPaidAt).toBeTruthy();
    expect(found?.request.customerSaysPaidNote ?? null).toBeNull();
    const view = await getPublicPaymentRequest(request.publicToken);
    expect(view?.business.isDemo).toBe(true);
  });

  it("marks a register for its own sessions and people only", async () => {
    const today = nassauToday();
    const session = (await listBusinessSessions(demoId, today)).find((s) => s.programName === "After-School Art Club" && s.date < today)!;
    const roster = await getBusinessSessionRoster(demoId, session.id);
    expect(roster?.rows).toHaveLength(5);
    expect(Object.keys(roster!.rows[0]).sort()).toEqual(["participantName", "registrationId", "status"]);
    await markBusinessAttendance(demoId, { sessionId: session.id, registrationId: roster!.rows[0].registrationId, status: "present", markedBy: "Demo visitor" });
    expect((await getBusinessSessionRoster(demoId, session.id))?.rows[0].status).toBe("present");
    // Another business can't read or mark it; nor can a Saturday child be
    // marked on the Art Club's register.
    expect(await getBusinessSessionRoster(realOrgId, session.id)).toBeNull();
    await expect(markBusinessAttendance(realOrgId, { sessionId: session.id, registrationId: roster!.rows[0].registrationId, status: "absent", markedBy: "x" })).rejects.toThrow("NOT_FOUND");
    const saturdayChild = (await listBusinessRegistrations(demoId)).find((r) => r.programName === "Saturday Kids Club")!;
    await expect(markBusinessAttendance(demoId, { sessionId: session.id, registrationId: saturdayChild.id, status: "present", markedBy: "x" })).rejects.toThrow("NOT_FOUND");
    // No health columns are read for a demo registration.
    expect((await getBusinessRegistration(demoId, saturdayChild.id, { mayViewHealth: false }))?.health).toBeNull();
  });
});

describe("a demo session opens the demo and nothing else", () => {
  it("is accepted for the demo business", async () => {
    jar.set(DEMO_COOKIE, issueDemoToken(demoId)!);
    expect((await currentDemo())?.id).toBe(demoId);
    expect((await requireDemoApi()).ok).toBe(true);
    const access = await paymentsApiAccess(demoId, { demo: true });
    expect(access.ok && access.access).toMatchObject({ orgId: demoId, door: "demo", canEditSettings: false, canManageTeam: false, actorEmail: null });
  });

  it("is refused by every handler that hasn't opted in (settings, team, exports, typed requests)", async () => {
    jar.set(DEMO_COOKIE, issueDemoToken(demoId)!);
    const refused = await paymentsApiAccess(demoId);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.response.status).toBe(403);
      expect(await refused.response.json()).toMatchObject({ code: "demo_off" });
    }
  });

  it("opens no real business, no admin area and no account", async () => {
    jar.set(DEMO_COOKIE, issueDemoToken(demoId)!);
    for (const denied of [await paymentsApiAccess(realOrgId, { demo: true }), await paymentsApiAccess(realOrgId), await requireOrgRoleApi(realOrgId, "org_viewer"), await requireOrgRoleApi(demoId, "org_viewer"), await requirePlatformRoleApi("platform_admin"), await requireSignedInApi()]) {
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.response.status).toBe(401);
    }
  });

  it("is refused when it names a business that isn't the demo, or has expired", async () => {
    // Properly signed, for a real business: still not a demo session.
    jar.set(DEMO_COOKIE, issueDemoToken(realOrgId)!);
    expect(await currentDemo()).toBeNull();
    expect((await requireDemoApi()).ok).toBe(false);
    expect((await paymentsApiAccess(realOrgId, { demo: true })).ok).toBe(false);
    jar.set(DEMO_COOKIE, issueDemoToken(demoId, Date.now() - 3 * 60 * 60 * 1000)!);
    expect(await currentDemo()).toBeNull();
    jar.set(DEMO_COOKIE, "not-a-token");
    expect(await currentDemo()).toBeNull();
    jar.delete(DEMO_COOKIE);
    expect(await currentDemo()).toBeNull();
  });
});
