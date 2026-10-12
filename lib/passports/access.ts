// Who may see and score which child's passport (brief 31, D). Pure.
//
// The CEO and admins: every child. A coach: the children in the classes
// they lead (the program's lead coach, which the desk sets; a coach can't
// make themselves one, whereas any coach can add themselves to a session's
// staff from the roster, so that never counts). A helper, a coach login
// with no profile, and anyone signed out: none. The server checks this on
// every read and save; the roster itself shows any session to any coach,
// as it did before.

import { roleCan, type FutprepRole } from "../futprepRoles";

export type PassportViewer = { role: FutprepRole | null; coachId: number | null };

export type PassportCoaches = { leadCoachId: number | null };

export function seesEveryPassport(role: FutprepRole | null | undefined): boolean {
  return roleCan(role, "all_passports");
}

export function canSeePassport(viewer: PassportViewer, coaches: PassportCoaches): boolean {
  if (seesEveryPassport(viewer.role)) return true;
  if (!roleCan(viewer.role, "own_passports") || viewer.coachId === null) return false;
  return coaches.leadCoachId !== null && coaches.leadCoachId === viewer.coachId;
}
