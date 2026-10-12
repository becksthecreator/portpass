// Who may see and score which child's passport (brief 31, D). Pure.
//
// The CEO and admins: every child. A coach: the children in a program and
// term they coach (they are on a session's staff that term, or they are the
// program's default lead). A helper, a coach login with no profile, and
// anyone signed out: none. The server checks this on every read and save;
// the roster itself shows any session to any coach, as it did before.

import { roleCan, type FutprepRole } from "../futprepRoles";

export type PassportViewer = { role: FutprepRole | null; coachId: number | null };

export type PassportCoaches = { staffCoachIds: number[]; defaultLeadCoachId: number | null };

export function seesEveryPassport(role: FutprepRole | null | undefined): boolean {
  return roleCan(role, "all_passports");
}

export function canSeePassport(viewer: PassportViewer, coaches: PassportCoaches): boolean {
  if (seesEveryPassport(viewer.role)) return true;
  if (!roleCan(viewer.role, "own_passports") || viewer.coachId === null) return false;
  return coaches.staffCoachIds.includes(viewer.coachId) || coaches.defaultLeadCoachId === viewer.coachId;
}
