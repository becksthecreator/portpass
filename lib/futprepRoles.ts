// What each Futprep staff role may do (brief 31, Part A). The table in
// docs/futprep/roles.md says it in words; lib/futprepRoles.test.ts keeps
// the two in step. Pages and routes still check the role themselves
// (requireFutprepStaff / currentFutprepStaffRole); these answers are the
// rules they check against. Pure: no server imports.

export type FutprepRole = "admin" | "coach" | "ceo" | "helper";
export const FUTPREP_ROLES: FutprepRole[] = ["ceo", "admin", "coach", "helper"];

export type FutprepCapability =
  | "prices"
  | "pay_rates"
  // Brief 31 (C5): what a coach is paid for a private session, 30 and 60
  // minutes. The brief gives these to the CEO and admins; class pay rates
  // stay the CEO's.
  | "private_pay_rates"
  | "locations"
  | "team"
  | "accounts"
  | "registrations"
  | "payments"
  | "schedules"
  | "own_sessions"
  | "own_inbox"
  | "all_inboxes"
  | "own_days"
  | "own_pay"
  | "all_pay"
  | "own_passports"
  | "roster";

const CAN: Record<FutprepRole, FutprepCapability[]> = {
  ceo: ["prices", "pay_rates", "private_pay_rates", "locations", "team", "accounts", "registrations", "payments", "schedules", "own_sessions", "own_inbox", "all_inboxes", "own_days", "own_pay", "all_pay", "own_passports", "roster"],
  admin: ["private_pay_rates", "locations", "team", "accounts", "registrations", "payments", "schedules", "own_inbox", "all_inboxes", "own_days", "own_pay"],
  coach: ["own_sessions", "own_inbox", "own_days", "own_pay", "own_passports", "roster"],
  helper: ["roster"],
};

export function roleCan(role: FutprepRole | null | undefined, capability: FutprepCapability): boolean {
  return role ? CAN[role].includes(capability) : false;
}

// A child's allergies, conditions, medications and special needs: the CEO
// login always; an admin login (on the registration record) or a coach
// login (on the roster) only when its can_view_medical switch is on, which
// only the CEO can turn on; a helper never. Off by default, so a login an
// admin makes can't be used to get round the switch.
export function canSeeMedical(role: FutprepRole | null | undefined, canViewMedicalSwitch: boolean): boolean {
  if (role === "ceo") return true;
  if (role === "admin" || role === "coach") return canViewMedicalSwitch;
  return false;
}

// The registration record without its health fields (lib/health.ts
// HEALTH_COLUMNS), for a login that may not see them: the values blanked
// and their lines taken out of the edit history, which records old and new
// values. The emergency contact and pickup follow the same switch since
// brief 34 (withoutEmergencyDetail below).
const HEALTH_EDIT_LABELS = new Set(["Allergies", "Medical conditions", "Medications", "Special needs", "Notes"]);
type HealthBearingDetail = {
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  special_needs: string | null;
  medical_info_source: string | null;
  additional_notes: string;
  edits: Array<{ changes: Record<string, unknown> }>;
};
export function withoutHealthDetail<T extends HealthBearingDetail>(detail: T): T {
  const edits = detail.edits
    .map((edit) => ({ ...edit, changes: Object.fromEntries(Object.entries(edit.changes).filter(([label]) => !HEALTH_EDIT_LABELS.has(label))) }))
    .filter((edit) => Object.keys(edit.changes).length > 0);
  return { ...detail, allergies: null, medical_conditions: null, medications: null, special_needs: null, medical_info_source: null, additional_notes: "", edits } as T;
}

// The same fields as the registration editor saves them: a login that may
// not see them never changes them either.
export const HEALTH_SAVE_KEYS = ["allergies", "medicalConditions", "medications", "specialNeeds", "additionalNotes"] as const;
export function withoutHealthInput<T extends Record<string, unknown>>(body: T): T {
  const copy: Record<string, unknown> = { ...body };
  for (const key of HEALTH_SAVE_KEYS) delete copy[key];
  return copy as T;
}

// A child's emergency contact and authorised pickup (brief 34, audit
// finding 4). Never in a list or an export (lib/rosterCsv.ts). On screen:
//   the registration record: the medical view only (canSeeMedical);
//   the coach roster: the medical view, and a coach login on duty for that
//   session on its day. "On duty" is worked out by the coach page: it is
//   one of the coaches recorded for the session, or nobody is recorded yet.
// An admin without the medical view never sees them on the roster, and a
// helper never sees them anywhere.
export function rosterSafetyShown(input: {
  role: FutprepRole | null | undefined;
  canViewMedical: boolean;
  sessionDate: string;
  today: string;
  onDuty: boolean;
}): boolean {
  if (canSeeMedical(input.role, input.canViewMedical)) return true;
  return input.role === "coach" && input.onDuty && input.sessionDate === input.today;
}

// The registration record without the emergency contact and pickup, for a
// login without the medical view: blanked, and their lines taken out of
// the edit history (which records old and new values).
const EMERGENCY_EDIT_LABELS = new Set(["Emergency contact name", "Emergency contact phone", "Authorized pickup"]);
type EmergencyBearingDetail = {
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  authorized_pickup: string | null;
  edits: Array<{ changes: Record<string, unknown> }>;
};
export function withoutEmergencyDetail<T extends EmergencyBearingDetail>(detail: T): T {
  const edits = detail.edits
    .map((edit) => ({ ...edit, changes: Object.fromEntries(Object.entries(edit.changes).filter(([label]) => !EMERGENCY_EDIT_LABELS.has(label))) }))
    .filter((edit) => Object.keys(edit.changes).length > 0);
  return { ...detail, emergency_contact_name: null, emergency_contact_phone: null, authorized_pickup: null, edits } as T;
}

// The same fields as the registration editor saves them: a login that may
// not see them never changes them either.
export const EMERGENCY_SAVE_KEYS = ["emergencyContactName", "emergencyContactPhone", "authorizedPickup"] as const;
export function withoutEmergencyInput<T extends Record<string, unknown>>(body: T): T {
  const copy: Record<string, unknown> = { ...body };
  for (const key of EMERGENCY_SAVE_KEYS) delete copy[key];
  return copy as T;
}

// Who may switch an admin's medical view on or off: the owner only.
export function canSetMedicalSwitch(role: FutprepRole | null | undefined): boolean {
  return role === "ceo";
}

// Programs (days, times, places, and the prices Alex sets): admins and
// the CEO add them and switch them on or off; coaches read only.
export function canChangePrograms(role: FutprepRole | null | undefined): boolean {
  return role === "admin" || role === "ceo";
}

// The owner bridge: an admin or the CEO marks one login as the owner, and
// only a CEO login can be the owner (docs/futprep/roles.md: ceo = owner).
// Marking only asks; a PortPass founder gives the access (db/futprepOwner.ts).
// Moving a mark another login holds is the CEO login's alone (checked there).
export function canMarkOwner(role: FutprepRole | null | undefined): boolean {
  return role === "admin" || role === "ceo";
}

export function canBeOwner(targetRole: FutprepRole | string | null | undefined): boolean {
  return targetRole === "ceo";
}

// Red chips on Team and Accounts until each is set (brief 31, A3).
export type LoginState = { linked: boolean; hasEmail: boolean; hasPin: boolean; active: boolean };
export function missingForLogin(state: LoginState): string[] {
  if (!state.linked) return ["No login"];
  const out: string[] = [];
  if (!state.hasEmail) out.push("No email");
  if (!state.hasPin) out.push("No PIN yet");
  if (!state.active) out.push("Login switched off");
  return out;
}
