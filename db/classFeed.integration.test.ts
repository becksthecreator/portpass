import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No staff cookie: the routes must refuse.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
import { DELETE as routeDELETE, GET as routeGET, POST as routePOST } from "@/app/api/futprep/staff/class-posts/route";
import { nassauToday } from "@/lib/futprepTerms";
import { assertLocalSupabase } from "@/lib/localStackOnly.mjs";
import { classRecipients, createClassPost, findFeedClass, listClassPosts, listFeedClasses, listParentFeed, removeClassPost } from "./classFeed";
import { createFutprepProgram } from "./programs";

// The class feed against the local Supabase stack: two TEST classes in
// Futprep's organisation, TEST families at @example.com (never emailed,
// lib/email.ts), all deleted afterwards. Local stack only.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const MARK = `TEST — delete ${tag}`;
const HEALTH = `TEST_HEALTH_MARKER_${tag}`;
const today = nassauToday();
const shift = (days: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const email = (who: string) => `test-delete-${tag}-${who}@example.com`;

let orgId = 0;
const cls: Record<"a" | "b", { programId: number; termId: number }> = {} as never;
const regIds: number[] = [];

async function makeClass(key: "a" | "b") {
  const made = await createFutprepProgram({
    name: `${MARK} class ${key}`, ageMin: 3, ageMax: 6, coed: true, locationName: `${MARK} field`, locationAddress: "TEST address",
    dayOfWeek: "Saturday", startTime: "10:00 AM", endTime: "10:45 AM", capacity: 20,
    termName: `${MARK} Term`, termStartDate: shift(-7), termEndDate: shift(56), breakDates: [],
    weeklyFeeCents: 4200, termFeeCents: 42000, registrationFeeCents: 0,
  });
  const { data: term } = await db().from("program_terms").select("id").eq("program_id", made.id).single();
  cls[key] = { programId: made.id, termId: Number(term!.id) };
}

async function child(key: "a" | "b", parent: string, name: string, status = "confirmed") {
  const n = regIds.length;
  const { data, error } = await db().from("registrations").insert({
    reference_code: `FP-T${tag.toUpperCase()}${n}`.slice(0, 20), organization_id: orgId, program_id: cls[key].programId, term_id: cls[key].termId,
    parent_name: `${MARK} Parent`, parent_email: email(parent), parent_phone: "242-555-0101",
    child_name: `${name} ${MARK}`, child_dob: shift(-365 * 4), allergies: HEALTH, medical_conditions: HEALTH, emergency_contact_name: HEALTH,
    payment_frequency: "term", payment_method: "cash", amount_due_cents: 42000,
    registration_status: status, payment_status: "pending", consent_version: "test", consent_accepted: true, submitted_at: new Date().toISOString(),
  }).select("id").single();
  expect(error).toBeNull();
  regIds.push(Number(data!.id));
}

beforeAll(async () => {
  assertLocalSupabase();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  await makeClass("a");
  await makeClass("b");
  await child("a", "one", "Ana");
  await child("a", "one", "Ben"); // same family, second child
  await child("a", "two", "Cal", "pending");
  await child("a", "three", "Dee", "waitlist"); // not in the class yet
  await child("b", "two", "Eve");
});

afterAll(async () => {
  if (regIds.length) await db().from("registrations").delete().in("id", regIds);
  for (const c of Object.values(cls)) {
    await db().from("class_posts").delete().eq("program_id", c.programId);
    await db().from("programs").delete().eq("id", c.programId);
  }
});

describe("class feed (Nov 2026)", () => {
  it("lists the class with one count per family, not per child", async () => {
    const classes = await listFeedClasses();
    const a = classes.find((c) => c.programId === cls.a.programId && c.termId === cls.a.termId);
    expect(a?.families).toBe(2);
  });

  it("only takes a term that belongs to the class", async () => {
    expect(await findFeedClass(cls.a.programId, cls.a.termId)).not.toBeNull();
    expect(await findFeedClass(cls.a.programId, cls.b.termId)).toBeNull();
    await expect(createClassPost({ programId: cls.a.programId, termId: cls.b.termId, body: "x", authorAccount: "test", authorName: "" })).rejects.toThrow("CLASS_NOT_FOUND");
  });

  it("emails each family in the class once, and not the waitlist", async () => {
    expect(await classRecipients(cls.a.programId, cls.a.termId)).toEqual([email("one"), email("two")].sort());
  });

  it("shows a parent only their own classes' updates, with first names and no health detail", async () => {
    const pa = await createClassPost({ programId: cls.a.programId, termId: cls.a.termId, body: `${MARK} class a: bring water`, authorAccount: "test", authorName: "Coach Test" });
    await createClassPost({ programId: cls.b.programId, termId: cls.b.termId, body: `${MARK} class b only`, authorAccount: "test", authorName: "" });

    const one = await listParentFeed(email("one").toUpperCase());
    expect(one.classes).toHaveLength(1);
    expect(one.classes[0].children).toEqual(["Ana", "Ben"]);
    expect(one.posts.map((p) => p.id)).toEqual([pa.id]);
    expect(JSON.stringify(one)).not.toContain(HEALTH);

    const two = await listParentFeed(email("two"));
    expect(two.classes).toHaveLength(2);
    expect(two.posts).toHaveLength(2);

    expect((await listParentFeed(email("three"))).classes).toHaveLength(0);
    expect((await listParentFeed("nobody-" + email("x"))).posts).toHaveLength(0);
  });

  it("hides a removed update everywhere, once", async () => {
    const post = await createClassPost({ programId: cls.a.programId, termId: cls.a.termId, body: `${MARK} to remove`, authorAccount: "test", authorName: "" });
    expect(await removeClassPost(post.id, "test")).toBe(true);
    expect(await removeClassPost(post.id, "test")).toBe(false);
    expect((await listClassPosts(cls.a.programId, cls.a.termId)).some((p) => p.id === post.id)).toBe(false);
    expect((await listParentFeed(email("one"))).posts.some((p) => p.id === post.id)).toBe(false);
  });

  it("refuses the staff routes without a staff login", async () => {
    const url = `http://localhost/api/futprep/staff/class-posts?programId=${cls.a.programId}&termId=${cls.a.termId}`;
    expect((await routeGET(new Request(url))).status).toBe(403);
    const json = (body: unknown, method: string) => new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await routePOST(json({ ...cls.a, body: "hi" }, "POST"))).status).toBe(403);
    expect((await routeDELETE(json({ postId: 1 }, "DELETE"))).status).toBe(403);
  });
});
