import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as lookupPOST } from "@/app/api/futprep/registrations/lookup/route";
import { nassauToday } from "@/lib/futprepTerms";
import { getStaffPassport, passportCoaches, passportCounts, savePassportMark, savePassportNote, sharedPassportFor, sharePassport } from "./passports";
import { createFutprepProgram } from "./programs";

// Brief 31 (D), the Progress Passport, against the local Supabase stack:
// TEST children in a TEST class in Futprep's organisation, three TEST
// coaches, a TEST offering; all deleted afterwards. Local stack only.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${tag}`;
const HEALTH = `TEST_HEALTH_MARKER_${tag}`;
const today = nassauToday();
function shift(days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let orgId = 0;
let programId = 0;
let termId = 0;
let lead = 0;
let staffCoach = 0;
let other = 0;
let offeringId = 0;
let unpublishedId = 0;
const reg: Record<"young" | "older" | "noPhotos" | "cancelled", { id: number; code: string; dob: string }> = {} as never;

async function child(key: keyof typeof reg, dob: string, photo: string, status = "confirmed") {
  const code = `FP-2026-T${tag.toUpperCase()}${key.slice(0, 1).toUpperCase()}`.slice(0, 20);
  const { data, error } = await db().from("registrations").insert({
    reference_code: code, organization_id: orgId, program_id: programId, term_id: termId,
    parent_name: `${MARK} Parent`, parent_email: `test-delete-${tag}-${key}@example.com`, parent_phone: "242-555-0101",
    child_name: `${MARK} ${key} Child`, child_dob: dob, photo_consent: photo, allergies: HEALTH, medical_conditions: HEALTH,
    emergency_contact_name: HEALTH, payment_frequency: "term", payment_method: "cash", amount_due_cents: 42000,
    registration_status: status, payment_status: "pending", consent_version: "test", consent_accepted: true, submitted_at: new Date().toISOString(),
  }).select("id,reference_code").single();
  expect(error).toBeNull();
  reg[key] = { id: Number(data!.id), code: String(data!.reference_code), dob };
}

beforeAll(async () => {
  const url = process.env.SUPABASE_URL ?? "";
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("Refusing to run against anything but a local Supabase stack.");
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: coaches, error } = await db().from("coach_profiles").insert(["lead", "staff", "other"].map((k) => ({ organization_id: orgId, slug: `test-delete-${k}-${tag}`, display_name: `${MARK} Coach ${k}`, member_type: "coach", active: true, public_visible: false, bookable: false }))).select("id,display_name");
  expect(error).toBeNull();
  lead = Number(coaches!.find((c) => c.display_name.endsWith("lead"))!.id);
  staffCoach = Number(coaches!.find((c) => c.display_name.endsWith("staff"))!.id);
  other = Number(coaches!.find((c) => c.display_name.endsWith("other"))!.id);
  // A Saturday class that started three weeks ago and runs eight more.
  const made = await createFutprepProgram({
    name: `${MARK} class`, ageMin: 2, ageMax: 8, coed: true, locationName: `${MARK} field`, locationAddress: "TEST address",
    dayOfWeek: "Saturday", startTime: "10:00 AM", endTime: "10:45 AM", capacity: 20,
    termName: `${MARK} Term`, termStartDate: shift(-21), termEndDate: shift(56), breakDates: [],
    weeklyFeeCents: 4500, termFeeCents: 42000, registrationFeeCents: 0,
  });
  programId = made.id;
  const { data: term } = await db().from("program_terms").select("id,start_date").eq("program_id", programId).single();
  termId = Number(term!.id);
  await db().from("programs").update({ default_lead_coach_id: lead }).eq("id", programId);
  const { data: session } = await db().from("sessions").select("id").eq("term_id", termId).order("session_date").limit(1).single();
  await db().from("session_staff").insert({ session_id: session!.id, coach_id: staffCoach, role: "assistant", pay_cents: 0, created_by: MARK });

  const start = String(term!.start_date);
  const yearsBefore = (years: number, extraDays = 0) => { const d = new Date(`${start}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - years); d.setUTCDate(d.getUTCDate() + extraDays); return d.toISOString().slice(0, 10); };
  await child("young", yearsBefore(3), "yes");
  await child("older", yearsBefore(6), "yes");
  await child("noPhotos", yearsBefore(7), "no");
  await child("cancelled", yearsBefore(6), "yes", "cancelled");

  const { data: offerings, error: offeringError } = await db().from("offerings").insert([
    { organization_id: orgId, type: "service", slug: `test-delete-next-${tag}`, name: `${MARK} next step`, price_cents: 3500, price_unit: "per_session", is_published: true },
    { organization_id: orgId, type: "service", slug: `test-delete-hidden-${tag}`, name: `${MARK} hidden step`, price_cents: 3500, price_unit: "per_session", is_published: false },
  ]).select("id,slug");
  expect(offeringError).toBeNull();
  offeringId = Number(offerings!.find((o) => o.slug.startsWith("test-delete-next"))!.id);
  unpublishedId = Number(offerings!.find((o) => o.slug.startsWith("test-delete-hidden"))!.id);
});

afterAll(async () => {
  const ids = Object.values(reg).map((r) => r.id).filter(Boolean);
  if (ids.length) {
    await db().from("passports").delete().in("registration_id", ids);
    await db().from("registrations").delete().in("id", ids);
  }
  if (programId) {
    const { data: sessions } = await db().from("sessions").select("id").eq("program_id", programId);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length) await db().from("session_staff").delete().in("session_id", sessionIds);
    await db().from("programs").delete().eq("id", programId);
  }
  await db().from("offerings").delete().in("id", [offeringId, unpublishedId].filter(Boolean));
  await db().from("coach_profiles").delete().in("id", [lead, staffCoach, other].filter(Boolean));
  await db().from("locations").delete().eq("organization_id", orgId).eq("name", `${MARK} field`);
  await db().from("audit_log").delete().eq("action", "futprep.passport_shared").like("after->>by", "TEST — delete%");
});

describe("the skills and the passport (brief 31, D)", () => {
  it("has the ten default skills: five football, five for Lil Kickers", async () => {
    const { data } = await db().from("passport_skills").select("band,name").is("organization_id", null).order("band").order("sort_order");
    expect(data?.filter((s) => s.band === "football").map((s) => s.name)).toEqual(["First touch", "Passing", "Dribbling", "Shooting", "Speed & agility"]);
    expect(data?.filter((s) => s.band === "lil_kickers").map((s) => s.name)).toEqual(["Balance", "Kicking", "Listening", "Teamwork", "Confidence"]);
  });

  it("makes one passport per child per term, the right skills for the age, and never one for a cancelled place", async () => {
    const young = await getStaffPassport(reg.young.id, MARK);
    const again = await getStaffPassport(reg.young.id, MARK);
    expect(young?.band).toBe("lil_kickers");
    expect(young?.skills.map((s) => s.name)).toEqual(["Balance", "Kicking", "Listening", "Teamwork", "Confidence"]);
    expect((await getStaffPassport(reg.older.id, MARK))?.band).toBe("football");
    const { count } = await db().from("passports").select("id", { count: "exact", head: true }).eq("registration_id", reg.young.id);
    expect(Number(count)).toBe(1);
    expect(again?.status).toBe("draft");
    expect(await getStaffPassport(reg.cancelled.id, MARK)).toBeNull();
  });

  it("never carries a health or emergency detail", async () => {
    const passport = await getStaffPassport(reg.older.id, MARK);
    expect(JSON.stringify(passport)).not.toContain(HEALTH);
  });
});

describe("whose players a coach sees (brief 31, D)", () => {
  it("the class's lead coach, as the desk set it; being on a session's staff doesn't count", async () => {
    expect(await passportCoaches(reg.older.id)).toEqual({ leadCoachId: lead });
  });
});

describe("marks, notes and clips (brief 31, D)", () => {
  it("saves each tap as one row holding the latest score; the database refuses a score outside 1 to 5", async () => {
    const passport = (await getStaffPassport(reg.older.id, MARK))!;
    const skill = passport.skills[0].id;
    await savePassportMark({ registrationId: reg.older.id, skillId: skill, phase: "start", score: 2, actor: MARK });
    await savePassportMark({ registrationId: reg.older.id, skillId: skill, phase: "start", score: 3, actor: MARK });
    const { data: rows } = await db().from("passport_marks").select("start_score,end_score").eq("skill_id", skill).eq("passport_id", (await db().from("passports").select("id").eq("registration_id", reg.older.id).single()).data!.id);
    expect(rows).toEqual([{ start_score: 3, end_score: null }]);
    const bad = await db().from("passport_marks").update({ end_score: 6 }).eq("skill_id", skill);
    expect(bad.error).not.toBeNull();
  });

  it("the database keeps a note to 500 characters", async () => {
    const { data: p } = await db().from("passports").select("id").eq("registration_id", reg.older.id).single();
    const long = await db().from("passport_notes").upsert({ passport_id: p!.id, note: "x".repeat(501) }, { onConflict: "passport_id" });
    expect(long.error).not.toBeNull();
  });

  it("takes a clip only when the family said yes to photos, in the app and in the database", async () => {
    await getStaffPassport(reg.noPhotos.id, MARK);
    await expect(savePassportNote({ registrationId: reg.noPhotos.id, note: "TEST", clipUrl: "https://youtu.be/test", nextStepOfferingId: null, actor: MARK })).rejects.toThrow("CLIP_NOT_ALLOWED");
    const { data: p } = await db().from("passports").select("id").eq("registration_id", reg.noPhotos.id).single();
    const direct = await db().from("passport_notes").upsert({ passport_id: p!.id, note: "", clip_url: "https://youtu.be/test" }, { onConflict: "passport_id" });
    expect(direct.error?.message ?? "").toContain("CLIP_NOT_ALLOWED");

    await savePassportNote({ registrationId: reg.older.id, note: "TEST lovely first touch", clipUrl: "https://youtu.be/test", nextStepOfferingId: offeringId, actor: MARK });
    expect((await getStaffPassport(reg.older.id, MARK))?.clipUrl).toBe("https://youtu.be/test");
    // Permission withdrawn: the clip is taken down, and doesn't come back
    // if permission is given again.
    await db().from("registrations").update({ photo_consent: "no" }).eq("id", reg.older.id);
    expect((await getStaffPassport(reg.older.id, MARK))?.clipUrl).toBeNull();
    await db().from("registrations").update({ photo_consent: "yes" }).eq("id", reg.older.id);
    expect((await getStaffPassport(reg.older.id, MARK))?.clipUrl).toBeNull();
    await savePassportNote({ registrationId: reg.older.id, note: "TEST lovely first touch", clipUrl: "https://youtu.be/test", nextStepOfferingId: offeringId, actor: MARK });
  });

  it("suggests a next step only from Futprep's published offerings", async () => {
    await expect(savePassportNote({ registrationId: reg.older.id, note: "TEST", clipUrl: null, nextStepOfferingId: unpublishedId, actor: MARK })).rejects.toThrow("BAD_NEXT_STEP");
  });
});

describe("sharing with the family (brief 31, D)", () => {
  it("shows the family nothing while it is a draft, by the same lookup they already use", async () => {
    expect(await sharedPassportFor(reg.older.code)).toBeNull();
    const response = await lookupPOST(new Request("https://portpass.test/api/futprep/registrations/lookup", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ referenceCode: reg.older.code, childDob: reg.older.dob }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("passport");
    expect(JSON.stringify(body)).not.toContain("TEST lovely first touch");
  });

  it("shares only once every skill has an end mark, then the family sees marks, note, clip and next step, never health", async () => {
    await expect(sharePassport({ registrationId: reg.older.id, actor: MARK })).rejects.toThrow("NOT_READY");
    const passport = (await getStaffPassport(reg.older.id, MARK))!;
    for (const skill of passport.skills) await savePassportMark({ registrationId: reg.older.id, skillId: skill.id, phase: "end", score: 4, actor: MARK });
    await sharePassport({ registrationId: reg.older.id, actor: MARK });
    await sharePassport({ registrationId: reg.older.id, actor: MARK });
    const view = await sharedPassportFor(reg.older.code);
    expect(view).toMatchObject({ note: "TEST lovely first touch", clipUrl: "https://youtu.be/test", nextStep: { name: `${MARK} next step` } });
    expect(view?.skills).toHaveLength(5);
    expect(JSON.stringify(view)).not.toContain(HEALTH);
    // Shared is final, in the app and in the database.
    await expect(savePassportMark({ registrationId: reg.older.id, skillId: passport.skills[0].id, phase: "end", score: 5, actor: MARK })).rejects.toThrow("SHARED");
    const { data: p } = await db().from("passports").select("id").eq("registration_id", reg.older.id).single();
    expect((await db().from("passport_marks").update({ end_score: 1 }).eq("passport_id", p!.id)).error?.message ?? "").toContain("PASSPORT_SHARED");
    expect((await db().from("passports").update({ status: "draft" }).eq("id", p!.id)).error?.message ?? "").toContain("PASSPORT_SHARED");
    const { count } = await db().from("audit_log").select("id", { count: "exact", head: true }).eq("action", "futprep.passport_shared").eq("target_table", "passports");
    expect(Number(count)).toBeGreaterThanOrEqual(1);
  });

  it("the family's lookup now carries the passport, and a wrong date of birth still shows nothing", async () => {
    const ask = (dob: string) => lookupPOST(new Request("https://portpass.test/api/futprep/registrations/lookup", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ referenceCode: reg.older.code, childDob: dob }) }));
    const right = await ask(reg.older.dob);
    expect((await right.json()).passport).toMatchObject({ note: "TEST lovely first touch" });
    expect((await ask("2000-01-01")).status).toBe(404);
  });

  it("a next step that is deleted simply goes; the passport stays", async () => {
    await db().from("offerings").delete().eq("id", offeringId);
    offeringId = 0;
    expect((await sharedPassportFor(reg.older.code))?.nextStep).toBeNull();
  });

  it("counts Futprep's passports per term on the operating map", async () => {
    const counts = await passportCounts();
    expect(counts.find((c) => c.termName === `${MARK} Term`)).toMatchObject({ started: 3, startMarked: 1, endMarked: 1, shared: 1 });
  });

  it("deleting a registration takes its passport, marks and note with it", async () => {
    const { data: p } = await db().from("passports").select("id").eq("registration_id", reg.young.id).single();
    const { error } = await db().from("registrations").delete().eq("id", reg.young.id);
    expect(error).toBeNull();
    const { data: gone } = await db().from("passports").select("id").eq("id", p!.id);
    expect(gone).toEqual([]);
  });
});
