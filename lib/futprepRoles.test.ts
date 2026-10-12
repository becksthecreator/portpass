import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canOpenCoachWorkspace, canBeOwner, canChangePrograms, canMarkOwner, canSeeMedical, canSetMedicalSwitch, FUTPREP_ROLES, missingForLogin, roleCan, rosterSafetyShown, withoutEmergencyDetail, withoutEmergencyInput, withoutHealthDetail, withoutHealthInput } from "./futprepRoles";

// docs/futprep/roles.md is what Futprep was told; this keeps the code to it.
const doc = readFileSync(join(process.cwd(), "docs/futprep/roles.md"), "utf8");
const tableRoles = [...doc.matchAll(/^\| `(\w+)`/gm)].map((m) => m[1]);

describe("Futprep roles (brief 31, Part A)", () => {
  it("has the same four roles as docs/futprep/roles.md, in the same order", () => {
    expect(tableRoles).toEqual(FUTPREP_ROLES);
  });

  it("gives prices, pay rates and everyone's pay to the owner only", () => {
    for (const capability of ["prices", "pay_rates", "all_pay"] as const) {
      expect(FUTPREP_ROLES.filter((role) => roleCan(role, capability))).toEqual(["ceo"]);
    }
  });

  it("gives registrations, payments, team, schedules, locations and private-session pay rates to admins and the owner", () => {
    for (const capability of ["registrations", "payments", "team", "schedules", "locations", "private_pay_rates"] as const) {
      expect(FUTPREP_ROLES.filter((role) => roleCan(role, capability)).sort()).toEqual(["admin", "ceo"]);
    }
  });

  it("keeps a coach to their own inbox, days, pay and passports", () => {
    expect(roleCan("coach", "own_inbox")).toBe(true);
    expect(roleCan("coach", "own_days")).toBe(true);
    expect(roleCan("coach", "own_pay")).toBe(true);
    expect(roleCan("coach", "own_passports")).toBe(true);
    for (const capability of ["all_inboxes", "all_pay", "registrations", "payments", "team", "prices"] as const) {
      expect(roleCan("coach", capability)).toBe(false);
    }
  });

  it("gives every passport to admins and the owner, a coach only their own, a helper none (brief 31, D)", () => {
    expect(FUTPREP_ROLES.filter((role) => roleCan(role, "all_passports")).sort()).toEqual(["admin", "ceo"]);
    expect(FUTPREP_ROLES.filter((role) => roleCan(role, "own_passports")).sort()).toEqual(["ceo", "coach"]);
    expect(roleCan("helper", "own_passports") || roleCan("helper", "all_passports")).toBe(false);
  });

  it("lets an admin login open the coaching workspace (Coach Bex is admin login 39)", () => {
    for (const role of ["coach", "ceo", "helper", "admin"] as const) expect(canOpenCoachWorkspace(role)).toBe(true);
    expect(canOpenCoachWorkspace(null)).toBe(false);
  });

  it("gives a helper the roster and nothing else", () => {
    expect(roleCan("helper", "roster")).toBe(true);
    expect(roleCan("helper", "own_inbox")).toBe(false);
    expect(roleCan("helper", "own_pay")).toBe(false);
    expect(roleCan(null, "roster")).toBe(false);
  });

  it("shows medical details to the owner always, an admin or coach only with the switch, never to a helper", () => {
    expect(canSeeMedical("ceo", false)).toBe(true);
    expect(canSeeMedical("admin", false)).toBe(false);
    expect(canSeeMedical("admin", true)).toBe(true);
    expect(canSeeMedical("coach", false)).toBe(false);
    expect(canSeeMedical("coach", true)).toBe(true);
    expect(canSeeMedical("helper", true)).toBe(false);
    expect(canSeeMedical(null, true)).toBe(false);
    expect(canSetMedicalSwitch("ceo")).toBe(true);
    expect(canSetMedicalSwitch("admin")).toBe(false);
  });

  it("lets admins and the owner change programs, never a coach", () => {
    expect(canChangePrograms("admin")).toBe(true);
    expect(canChangePrograms("ceo")).toBe(true);
    expect(canChangePrograms("coach")).toBe(false);
    expect(canChangePrograms("helper")).toBe(false);
  });

  it("lets an admin or the owner mark the owner, and only a CEO login can be it", () => {
    expect(canMarkOwner("admin")).toBe(true);
    expect(canMarkOwner("coach")).toBe(false);
    expect(canBeOwner("ceo")).toBe(true);
    expect(canBeOwner("admin")).toBe(false);
    expect(canBeOwner("admin_registrar")).toBe(false);
  });

  it("takes the health fields off a registration record, and their lines out of its history", () => {
    const detail = {
      id: 1,
      child_name: "TEST Child",
      emergency_contact_name: "TEST Gran",
      allergies: "TEST peanuts",
      medical_conditions: "TEST asthma",
      medications: "TEST inhaler",
      special_needs: "TEST x",
      medical_info_source: "parent",
      additional_notes: "TEST note",
      edits: [
        { id: 1, changes: { Allergies: { from: null, to: "TEST peanuts" } } },
        { id: 2, changes: { "Parent phone": { from: "1", to: "2" }, Notes: { from: "", to: "TEST note" } } },
      ],
    };
    const hidden = withoutHealthDetail(detail);
    expect(JSON.stringify(hidden)).not.toMatch(/peanuts|asthma|inhaler|TEST note|TEST x/);
    expect(hidden.emergency_contact_name).toBe("TEST Gran");
    expect(hidden.edits).toEqual([{ id: 2, changes: { "Parent phone": { from: "1", to: "2" } } }]);
    expect(detail.allergies).toBe("TEST peanuts");

    const body = withoutHealthInput({ childName: "TEST", allergies: "", medicalConditions: "", medications: "", specialNeeds: "", additionalNotes: "", parentPhone: "1" });
    expect(body).toEqual({ childName: "TEST", parentPhone: "1" });
  });

  it("names what each login still needs", () => {
    expect(missingForLogin({ linked: false, hasEmail: false, hasPin: false, active: false })).toEqual(["No login"]);
    expect(missingForLogin({ linked: true, hasEmail: false, hasPin: false, active: true })).toEqual(["No email", "No PIN yet"]);
    expect(missingForLogin({ linked: true, hasEmail: true, hasPin: true, active: false })).toEqual(["Login switched off"]);
    expect(missingForLogin({ linked: true, hasEmail: true, hasPin: true, active: true })).toEqual([]);
  });
});

// Brief 34 (audit finding 4): emergency contact and authorised pickup are
// shown on screen only, to logins with the medical view, and on the coach
// roster to the coach on duty for that session's day.
describe("who sees a child's emergency contact and pickup (brief 34)", () => {
  const day = { sessionDate: "2026-11-21", today: "2026-11-21" };
  it("the medical view always; a helper never", () => {
    expect(rosterSafetyShown({ role: "ceo", canViewMedical: false, ...day, today: "2026-11-01" })).toBe(true);
    expect(rosterSafetyShown({ role: "coach", canViewMedical: true, ...day, today: "2026-11-01" })).toBe(true);
    expect(rosterSafetyShown({ role: "helper", canViewMedical: true, ...day })).toBe(false);
  });

  it("a coach without the medical view: only on that session's own day", () => {
    expect(rosterSafetyShown({ role: "coach", canViewMedical: false, ...day })).toBe(true);
    expect(rosterSafetyShown({ role: "coach", canViewMedical: false, sessionDate: "2026-11-21", today: "2026-11-20" })).toBe(false);
    expect(rosterSafetyShown({ role: "coach", canViewMedical: false, sessionDate: "2026-11-21", today: "2026-11-22" })).toBe(false);
  });

  it("an admin without the medical view: never on the roster", () => {
    expect(rosterSafetyShown({ role: "admin", canViewMedical: false, ...day })).toBe(false);
  });

  it("the desk record without the medical view: emergency contact and pickup blanked, and never saved", () => {
    const detail = { emergency_contact_name: "ZZNAME", emergency_contact_phone: "+12425550111", authorized_pickup: "ZZPICKUP", edits: [{ changes: { "Emergency contact name": ["a", "b"], "Emergency contact phone": ["e", "f"], "Authorized pickup": ["c", "d"], Status: ["x", "y"] } }] };
    const shown = withoutEmergencyDetail(detail);
    expect(shown).toMatchObject({ emergency_contact_name: null, emergency_contact_phone: null, authorized_pickup: null });
    expect(JSON.stringify(shown)).not.toMatch(/ZZNAME|ZZPICKUP|5550111/);
    expect(shown.edits).toEqual([{ changes: { Status: ["x", "y"] } }]);
    expect(withoutEmergencyInput({ emergencyContactName: "x", emergencyContactPhone: "y", authorizedPickup: "z", childName: "kept" })).toEqual({ childName: "kept" });
  });
});
