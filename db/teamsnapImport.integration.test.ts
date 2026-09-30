import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFutprepProgram, listFutprepPrograms } from "./programs";
import { createFutprepPendingRegistration, ensureFutprepPilotData } from "./registrations";
import { applyTeamsnapImport, previewTeamsnapImport } from "./teamsnapImport";

// Brief 13, part 5 acceptance against the local Supabase stack: a TeamSnap
// roster fills in the details of registrations staff added by name, only
// where empty, medical only when present, consent left unset, and the
// import is logged. Nothing is sent to anyone (the module has no email or
// messaging code at all). Every row is "TEST — delete".
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const locationName = `${MARK} field`;
let orgId = 0;
let programId = 0;
let termId = 0;
let slug = "";
const ids: Record<string, number> = {};

const CSV = [
  "First Name,Last Name,Birthdate,Gender,Contact 1 First Name,Contact 1 Last Name,Contact 1 Email,Contact 1 Mobile Phone,Emergency Contact Name,Emergency Contact Phone,Allergies,Medications,Jersey Number",
  `"${MARK} Ava",Rolle,03/14/2022,Female,Kim,Rolle,KIM.TEST@test.portpass.local,(242) 555-0101,Tom Rolle,242-555-0102,TEST peanuts,,7`,
  `"${MARK} Ben",Smith,11/02/2021,Male,Jo,Smith,jo.test@test.portpass.local,2425550103,,,,,9`,
  `"${MARK} Zoe",Twin,01/01/2022,,,,,,,,,,`,
  `"${MARK} Cal",Nobody,01/01/2022,,,,,,,,,,`,
  `"${MARK} Dee",Done,01/01/2022,,Pat,Done,pat.test@test.portpass.local,2425550104,,,,,`,
].join("\r\n");

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const made = await createFutprepProgram({
    name: `${MARK} Kickers`, ageMin: 3, ageMax: 6, coed: true, locationName, locationAddress: "TEST",
    dayOfWeek: "Saturday", startTime: "10:00 AM", endTime: "10:45 AM", capacity: 20,
    termName: "TEST Term", termStartDate: "2099-01-03", termEndDate: "2099-03-21", breakDates: [],
    weeklyFeeCents: 4500, termFeeCents: 42000, registrationFeeCents: 0,
  });
  programId = made.id;
  slug = (await listFutprepPrograms()).find((p) => p.id === programId)!.slug;
  const { data: term } = await db().from("program_terms").select("id").eq("program_id", programId).single();
  termId = Number(term!.id);
  for (const name of ["Ava Rolle", "Ben Smith", "Zoe Twin", "Dee Done"]) {
    const added = await createFutprepPendingRegistration({
      childName: `${MARK} ${name}`, programSlug: slug, termId, enteredByStaff: MARK,
      // Staff already have Ben's parent's name: the import must not replace it.
      parentName: name === "Ben Smith" ? "Jo Smith (from staff)" : undefined,
    });
    ids[name] = added.registrationId;
  }
  // Two Zoes: ambiguous. Dee's parent already completed the form.
  await db().from("registrations").insert({
    reference_code: `FP-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, organization_id: orgId, program_id: programId, term_id: termId,
    child_name: `${MARK} Zoe Twin`, payment_frequency: "weekly", amount_due_cents: 4500, registration_status: "pending_details", payment_status: "pending",
    consent_version: "test", consent_accepted: false, submitted_at: new Date().toISOString(), commission_eligible: false, commission_reason: "TEST", is_new_family: false,
  });
  await db().from("registrations").update({ registration_status: "pending" }).eq("id", ids["Dee Done"]);
});

afterAll(async () => {
  if (programId) {
    await db().from("registrations").delete().eq("program_id", programId);
    await db().from("programs").delete().eq("id", programId);
  }
  await db().from("locations").delete().eq("organization_id", orgId).eq("name", locationName);
  await db().from("audit_log").delete().eq("action", "futprep.teamsnap_import").like("after->>by", "TEST — delete%");
});

describe("Import from TeamSnap (brief 13)", () => {
  it("previews matches by child name without showing any medical note", async () => {
    const preview = await previewTeamsnapImport({ programId, termId, csv: CSV });
    expect(preview.counts).toEqual({ fill: 2, nothing_new: 0, no_match: 1, ambiguous: 1, not_pending: 1 });
    expect(preview.unmapped).toEqual(["Jersey Number"]);
    const ava = preview.rows.find((r) => r.childName.endsWith("Ava Rolle"))!;
    expect(ava.status).toBe("fill");
    expect(ava.fields).toEqual(expect.arrayContaining(["parent name", "parent email", "parent phone", "date of birth", "emergency contact", "medical notes (1)"]));
    expect(JSON.stringify(preview)).not.toContain("peanuts");
    // Nothing is written by a preview.
    const { data } = await db().from("registrations").select("parent_email").eq("id", ids["Ava Rolle"]).single();
    expect(data!.parent_email).toBeNull();
  });

  it("fills only what's missing, medical only when present, leaves consent unset, and logs it", async () => {
    const result = await applyTeamsnapImport({ programId, termId, csv: CSV, actor: MARK });
    expect(result.updated).toBe(2);

    const { data: ava } = await db().from("registrations").select("parent_name,parent_email,parent_phone,child_dob,emergency_contact_name,emergency_contact_phone,allergies,medications,consent_accepted,registration_status").eq("id", ids["Ava Rolle"]).single();
    expect(ava).toEqual({
      parent_name: "Kim Rolle", parent_email: "kim.test@test.portpass.local", parent_phone: "+12425550101", child_dob: "2022-03-14",
      emergency_contact_name: "Tom Rolle", emergency_contact_phone: "+12425550102", allergies: "TEST peanuts", medications: null,
      consent_accepted: false, registration_status: "pending_details",
    });
    const { data: ben } = await db().from("registrations").select("parent_name,parent_email,allergies,emergency_contact_name").eq("id", ids["Ben Smith"]).single();
    expect(ben).toEqual({ parent_name: "Jo Smith (from staff)", parent_email: "jo.test@test.portpass.local", allergies: null, emergency_contact_name: null });
    const { data: dee } = await db().from("registrations").select("parent_email").eq("id", ids["Dee Done"]).single();
    expect(dee!.parent_email).toBeNull();

    const { data: audit } = await db().from("audit_log").select("after").eq("action", "futprep.teamsnap_import").eq("target_id", `${programId}:${termId}`).single();
    expect(audit!.after).toMatchObject({ updated: 2, registrationIds: expect.arrayContaining([ids["Ava Rolle"], ids["Ben Smith"]]) });
    expect(JSON.stringify(audit!.after)).not.toMatch(/peanuts|Rolle|Smith/);
  });

  it("does nothing more on a second run", async () => {
    const again = await applyTeamsnapImport({ programId, termId, csv: CSV, actor: MARK });
    expect(again.updated).toBe(0);
    await db().from("audit_log").delete().eq("action", "futprep.teamsnap_import").eq("target_id", `${programId}:${termId}`);
  });
});
