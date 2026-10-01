import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addWeeklyCoachSlots, coachSlotPrompt, listAllCoachProfiles, listPublicCoachProfiles, saveCoachProfile, setCoachPhoto } from "./coaches";
import { ensureFutprepPilotData } from "./registrations";

// Brief 16, C1 and C2, against CI's local Supabase stack: the "add your
// weekly slots" prompt shows only for a staff login linked to a bookable
// coach with no open times, and a coach photo can be set and cleared.
// Every row is "TEST — delete" and removed afterwards.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
let orgId = 0;
let linkedStaff = 0;
let unlinkedStaff = 0;
let bookableCoach = 0;
let pausedCoach = 0;

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const { data: staff, error: staffError } = await db()
    .from("staff_members")
    .insert([
      { organization_id: orgId, name: `${MARK} linked`, role: "coach", responsibilities: "", active: true },
      { organization_id: orgId, name: `${MARK} unlinked`, role: "coach", responsibilities: "", active: true },
    ])
    .select("id,name");
  expect(staffError).toBeNull();
  linkedStaff = Number(staff!.find((s) => s.name.endsWith("linked") && !s.name.endsWith("unlinked"))!.id);
  unlinkedStaff = Number(staff!.find((s) => s.name.endsWith("unlinked"))!.id);
  const { data: coaches, error: coachError } = await db()
    .from("coach_profiles")
    .insert([
      { organization_id: orgId, slug: `test-delete-prompt-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} Bookable`, member_type: "coach", active: true, public_visible: false, bookable: true, staff_member_id: linkedStaff },
      { organization_id: orgId, slug: `test-delete-paused-${crypto.randomUUID().slice(0, 6)}`, display_name: `${MARK} Paused`, member_type: "coach", active: true, public_visible: false, bookable: false },
    ])
    .select("id,display_name");
  expect(coachError).toBeNull();
  bookableCoach = Number(coaches!.find((c) => c.display_name.endsWith("Bookable"))!.id);
  pausedCoach = Number(coaches!.find((c) => c.display_name.endsWith("Paused"))!.id);
});

afterAll(async () => {
  await db().from("coach_availability").delete().in("coach_id", [bookableCoach, pausedCoach].filter(Boolean));
  await db().from("coach_profiles").delete().in("id", [bookableCoach, pausedCoach].filter(Boolean));
  await db().from("staff_members").delete().in("id", [linkedStaff, unlinkedStaff].filter(Boolean));
});

describe("the weekly-slots prompt (brief 16, C1)", () => {
  it("shows for a linked, bookable coach with no open times, and goes away once they add some", async () => {
    expect(await coachSlotPrompt(linkedStaff)).toEqual({ coachId: bookableCoach, needsSlots: true });
    const added = await addWeeklyCoachSlots({ coachId: bookableCoach, dayOfWeek: "Wednesday", startTime: "4:00 PM", endTime: "4:45 PM", weeks: 2, location: "TEST field", actor: MARK });
    expect(added).toBe(2);
    expect(await coachSlotPrompt(linkedStaff)).toEqual({ coachId: bookableCoach, needsSlots: false });
  });

  it("never shows for a login with no coach, or whose coach isn't bookable or isn't active", async () => {
    expect(await coachSlotPrompt(unlinkedStaff)).toBeNull();
    // Link the paused coach to that login, and prove the link took: once
    // bookable, the prompt appears; paused or retired, it doesn't.
    const link = await db().from("coach_profiles").update({ staff_member_id: unlinkedStaff, bookable: true }).eq("id", pausedCoach);
    expect(link.error).toBeNull();
    expect(await coachSlotPrompt(unlinkedStaff)).toEqual({ coachId: pausedCoach, needsSlots: true });
    await db().from("coach_profiles").update({ bookable: false }).eq("id", pausedCoach);
    expect(await coachSlotPrompt(unlinkedStaff)).toBeNull();
    await db().from("coach_profiles").update({ bookable: true, active: false }).eq("id", pausedCoach);
    expect(await coachSlotPrompt(unlinkedStaff)).toBeNull();
    await db().from("coach_profiles").update({ active: true }).eq("id", pausedCoach);
  });

  it("counts only open times in the next 30 days: not blocked, not past, not further out", async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const slot = (date: string, status: string) => ({ coach_id: pausedCoach, availability_date: date, start_time: "4:00 PM", end_time: "4:45 PM", status, location: "TEST field", note: "", created_by: MARK });
    const { error } = await db().from("coach_availability").insert([slot(day(3), "blocked"), slot(day(4), "booked"), slot(day(-2), "available"), slot(day(45), "available")]);
    expect(error).toBeNull();
    expect(await coachSlotPrompt(unlinkedStaff)).toEqual({ coachId: pausedCoach, needsSlots: true });
    await db().from("coach_availability").insert(slot(day(10), "available"));
    expect(await coachSlotPrompt(unlinkedStaff)).toEqual({ coachId: pausedCoach, needsSlots: false });
  });
});

describe("coach photos (brief 16, C2)", () => {
  it("sets, replaces and clears photo_url, handing back what it replaced", async () => {
    const first = "https://example.test/storage/v1/object/public/org-assets/coach/1/first.jpg";
    const second = "https://example.test/storage/v1/object/public/org-assets/coach/1/second.jpg";
    expect(await setCoachPhoto(bookableCoach, first)).toEqual({ previousUrl: null });
    expect(await setCoachPhoto(bookableCoach, second)).toEqual({ previousUrl: first });
    const { data } = await db().from("coach_profiles").select("photo_url").eq("id", bookableCoach).single();
    expect(data!.photo_url).toBe(second);
    expect(await setCoachPhoto(bookableCoach, null)).toEqual({ previousUrl: second });
    await expect(setCoachPhoto(999999999, first)).rejects.toThrow("COACH_NOT_FOUND");
  });

  it("keeps an uploaded photo when Hide or Pause re-saves the profile without mentioning it", async () => {
    const kept = "https://example.test/storage/v1/object/public/org-assets/coach/1/kept.jpg";
    await setCoachPhoto(bookableCoach, kept);
    const { data: row } = await db().from("coach_profiles").select("slug,display_name").eq("id", bookableCoach).single();
    const profile = {
      id: bookableCoach, displayName: row!.display_name, slug: row!.slug, positionTitle: "Coach", memberType: "coach" as const,
      bio: "", licenses: [], playedAt: [], favoritePlayer: "", favoriteTeam: "", introVideoUrl: "", testimonialQuote: "", testimonialName: "",
      publicVisible: false, bookable: true, sortOrder: 999,
    };
    await saveCoachProfile(profile);
    const photo = async () => (await db().from("coach_profiles").select("photo_url").eq("id", bookableCoach).single()).data!.photo_url;
    expect(await photo()).toBe(kept);
    // An explicit empty Photo URL still clears it.
    await saveCoachProfile({ ...profile, photoUrl: "" });
    expect(await photo()).toBeNull();
  });
});

describe("team lists never carry pay (brief 13 rule, brief 16 review)", () => {
  it("returns no pay rate or staff-login column to the Team page or the public page", async () => {
    await db().from("coach_profiles").update({ default_lead_pay_cents: 5000, default_assistant_pay_cents: 2500, public_visible: true }).eq("id", bookableCoach);
    const { coaches: all } = await listAllCoachProfiles();
    const { coaches: shown } = await listPublicCoachProfiles();
    const mine = [all.find((c) => c.id === bookableCoach), shown.find((c) => c.id === bookableCoach)];
    for (const row of mine) {
      expect(row).toBeDefined();
      const keys = Object.keys(row!);
      expect(keys).not.toContain("default_lead_pay_cents");
      expect(keys).not.toContain("default_assistant_pay_cents");
      expect(keys).not.toContain("staff_member_id");
    }
    await db().from("coach_profiles").update({ public_visible: false }).eq("id", bookableCoach);
  });
});
