import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBusinessProgram, getBusinessRegistration, listBusinessPrograms, listBusinessRegistrations, setBusinessProgramActive, setBusinessRegistrationStatus } from "./businessRegistrations";
import { createFutprepRegistration, listFutprepOffers } from "./registrations";

// A business's own Registrations screen (brief 18, D4) against CI's local
// Supabase stack: a business adds a children's class and an adults' class,
// people register, and the team sees them. Health details are never in
// the list and are read only for someone allowed; another business's rows
// can't be reached. Every row is "TEST — delete" and removed.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let actor = "";
let orgId = 0;
let otherOrgId = 0;
let kidsSlug = "";
let adultsSlug = "";
let childRegistration = 0;
let adultRegistration = 0;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const scope = () => ({ organizationId: orgId, referencePrefix: "PP", consentVersion: "test" });

const person = (over: Record<string, unknown> = {}) => ({
  parentName: "TEST delete Parent", parentEmail: `reg-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`, parentPhone: "+12425550150", relationship: "Mother",
  childName: `Amara TEST delete ${TAG}`, childDob: day(-365 * 6), gender: "Female",
  emergencyContactName: `ZZEMERGENCY${TAG}`, emergencyContactPhone: "+12425550151",
  allergies: `ZZPEANUT${TAG}`, medicalConditions: `ZZASTHMA${TAG}`, medications: "", specialNeeds: "", authorizedPickup: `ZZPICKUP${TAG}`, additionalNotes: "",
  programSlug: kidsSlug, paymentFrequency: "term" as const, paymentMethod: "cash" as const, photoConsent: "no" as const, consentAccepted: true, signatureName: "TEST delete Parent",
  heardAboutUs: "instagram" as const,
  ...over,
});

beforeAll(async () => {
  const created = await db.auth.admin.createUser({ email: `test-delete-regs-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  actor = created.data.user.id;
  const { data: orgs, error } = await db
    .from("organizations")
    .insert([
      { name: `TEST delete ${TAG} Club`, slug: `test-delete-club-${TAG}`, primary_category: "entertainment", status: "draft" },
      { name: `TEST delete ${TAG} Other`, slug: `test-delete-other-${TAG}`, primary_category: "entertainment", status: "draft" },
    ])
    .select("id,slug");
  if (error || !orgs) throw new Error(`Could not seed the TEST businesses: ${error?.message}`);
  orgId = Number(orgs.find((o) => String(o.slug).includes("club"))!.id);
  otherOrgId = Number(orgs.find((o) => String(o.slug).includes("other"))!.id);
});

afterAll(async () => {
  for (const id of [orgId, otherOrgId].filter(Boolean)) {
    const { data: programs } = await db.from("programs").select("id").eq("organization_id", id);
    const ids = (programs ?? []).map((p) => p.id);
    if (ids.length) {
      await db.from("registrations").delete().in("program_id", ids);
      await db.from("sessions").delete().in("program_id", ids);
      await db.from("program_terms").delete().in("program_id", ids);
      await db.from("programs").delete().in("id", ids);
    }
    await db.from("locations").delete().eq("organization_id", id);
    await db.from("audit_log").delete().eq("organization_id", id);
    await db.from("organizations").delete().eq("id", id);
  }
  if (actor) {
    await db.from("audit_log").delete().eq("actor_user_id", actor);
    await db.auth.admin.deleteUser(actor);
  }
});

describe("a business sets up what people register for", () => {
  it("adds a children's class and an adults' class, each with its first term", async () => {
    const base = { programType: "term" as const, dayOfWeek: "Saturday", startTime: "10:00 AM", endTime: "11:00 AM", location: "TEST hall", capacity: 12, termName: "TEST term", termStartDate: day(-7), termEndDate: day(49), weeklyFeeCents: 2500, termFeeCents: 18000, registrationClosesAt: null };
    const kids = await createBusinessProgram(orgId, { ...base, name: `TEST delete ${TAG} Juniors`, audience: "children", ageMin: 4, ageMax: 10 }, actor);
    const adults = await createBusinessProgram(orgId, { ...base, name: `TEST delete ${TAG} Adults`, audience: "adults", ageMin: 18, ageMax: 99, weeklyFeeCents: 0 }, actor);
    kidsSlug = kids.slug;
    adultsSlug = adults.slug;

    const programs = await listBusinessPrograms(orgId);
    expect(programs.map((p) => [p.slug, p.audience, p.active]).sort()).toEqual([[adultsSlug, "adults", true], [kidsSlug, "children", true]].sort());
    expect(programs.every((p) => p.term?.name === "TEST term")).toBe(true);
    // Its weekly sessions were scheduled, as for any class.
    const { count } = await db.from("sessions").select("id", { count: "exact", head: true }).eq("program_id", kids.id);
    expect(count).toBeGreaterThan(5);
    // Another business sees none of it, and Futprep's list is untouched.
    expect(await listBusinessPrograms(otherOrgId)).toEqual([]);
    expect((await listFutprepOffers({ publicOnly: true })).some((o) => o.slug === kidsSlug)).toBe(false);
    const { data: logged } = await db.from("audit_log").select("action").eq("organization_id", orgId).eq("action", "program.created");
    expect(logged).toHaveLength(2);
  });

  it("opens and closes a programme, and only its own", async () => {
    const kids = (await listBusinessPrograms(orgId)).find((p) => p.slug === kidsSlug)!;
    await expect(setBusinessProgramActive(otherOrgId, kids.id, false, actor)).rejects.toThrow("NOT_FOUND");
    await setBusinessProgramActive(orgId, kids.id, false, actor);
    expect((await listFutprepOffers({ organizationId: orgId })).some((o) => o.slug === kidsSlug)).toBe(false);
    await setBusinessProgramActive(orgId, kids.id, true, actor);
    expect((await listFutprepOffers({ organizationId: orgId })).some((o) => o.slug === kidsSlug)).toBe(true);
  });
});

describe("the team sees who registered", () => {
  it("lists a child's and an adult's registration with no health detail in the list", async () => {
    const child = await createFutprepRegistration(person(), scope());
    const adult = await createFutprepRegistration(person({ programSlug: adultsSlug, parentName: `TEST delete Adult ${TAG}`, childName: `TEST delete Adult ${TAG}`, childDob: "", participantIsAdult: true, allergies: `ZZPEANUT${TAG}` }), scope());
    expect(adult.participantIsAdult).toBe(true);
    // No weekly fee on the adults' class: the term is paid in full.
    expect(adult.amountDueCents).toBe(18000);

    const list = await listBusinessRegistrations(orgId);
    expect(list).toHaveLength(2);
    childRegistration = list.find((r) => r.reference === child.referenceCode)!.id;
    adultRegistration = list.find((r) => r.reference === adult.referenceCode)!.id;
    expect(list.find((r) => r.id === adultRegistration)).toMatchObject({ participantIsAdult: true, programName: `TEST delete ${TAG} Adults`, termName: "TEST term", status: "pending", paymentStatus: "pending" });
    expect(JSON.stringify(list)).not.toMatch(/ZZPEANUT|ZZASTHMA|ZZEMERGENCY|ZZPICKUP/);
    expect(await listBusinessRegistrations(otherOrgId)).toEqual([]);
  });

  it("shows a child's health details only to someone allowed, and an adult has none", async () => {
    const hidden = (await getBusinessRegistration(orgId, childRegistration, { mayViewHealth: false }))!;
    expect(hidden.health).toBeNull();
    expect(JSON.stringify(hidden)).not.toMatch(/ZZPEANUT|ZZASTHMA|ZZEMERGENCY|ZZPICKUP/);
    const shown = (await getBusinessRegistration(orgId, childRegistration, { mayViewHealth: true }))!;
    expect(shown.health).toMatchObject({ allergies: `ZZPEANUT${TAG}`, medicalConditions: `ZZASTHMA${TAG}`, emergencyContactName: `ZZEMERGENCY${TAG}`, authorizedPickup: `ZZPICKUP${TAG}` });
    const adult = (await getBusinessRegistration(orgId, adultRegistration, { mayViewHealth: true }))!;
    expect(adult.health).toBeNull();
    expect(adult).toMatchObject({ participantIsAdult: true, childDob: null, gender: null });
    // Another business can't open it.
    expect(await getBusinessRegistration(otherOrgId, childRegistration, { mayViewHealth: true })).toBeNull();
  });

  it("confirms and cancels a registration, logged, and only its own", async () => {
    expect((await setBusinessRegistrationStatus(orgId, childRegistration, "confirmed", actor)).status).toBe("confirmed");
    await expect(setBusinessRegistrationStatus(otherOrgId, childRegistration, "cancelled", actor)).rejects.toThrow("NOT_FOUND");
    expect((await setBusinessRegistrationStatus(orgId, adultRegistration, "cancelled", actor)).status).toBe("cancelled");
    const { data: logged } = await db.from("audit_log").select("after").eq("organization_id", orgId).eq("action", "registration.status_changed");
    expect((logged ?? []).map((row) => (row.after as { status: string }).status).sort()).toEqual(["cancelled", "confirmed"]);
  });
});
