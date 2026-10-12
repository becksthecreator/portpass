// Who sees which private-session request (brief 31, C1). Pure: the inbox
// page, its API routes and the tests agree.
//
// The CEO and admin logins see every request. A coach login sees only the
// requests where their own coach profile is the preferred or the assigned
// coach; a request for "any coach" is the desk's until it is given to one.
// A coach login not linked to a profile, and a helper, see none. A parent's
// free-text notes can carry anything, health details included, so only a
// login with the medical view reads them (the CEO, an admin with the
// switch); a coach gets the request without them. The session goal stays:
// it is the coaching brief.
//
// Seeing is not acting: a referred request shows in both coaches' lists,
// but only the coach it is with now (the assigned coach, else the chosen
// one) may accept, decline, refer, complete or record a payment on it.

import type { FutprepRole } from "./futprepRoles";

// canViewNotes: the login's medical view (staff-auth); left out, the CEO
// and admins read notes.
export type InboxViewer = { role: FutprepRole | null; coachId: number | null; canViewNotes?: boolean };

export type RequestOwners = { preferred_coach_id: number | null; assigned_coach_id: number | null };

export function seesEveryRequest(role: FutprepRole | null | undefined): boolean {
  return role === "admin" || role === "ceo";
}

export function canSeeRequest(viewer: InboxViewer, request: RequestOwners): boolean {
  if (seesEveryRequest(viewer.role)) return true;
  if (viewer.role !== "coach" || viewer.coachId === null) return false;
  return (request.preferred_coach_id !== null && Number(request.preferred_coach_id) === viewer.coachId)
    || (request.assigned_coach_id !== null && Number(request.assigned_coach_id) === viewer.coachId);
}

export function canActOnRequest(viewer: InboxViewer, request: RequestOwners): boolean {
  if (seesEveryRequest(viewer.role)) return true;
  if (viewer.role !== "coach" || viewer.coachId === null) return false;
  const holder = request.assigned_coach_id ?? request.preferred_coach_id;
  return holder !== null && Number(holder) === viewer.coachId;
}

export function inboxFor<T extends RequestOwners & { notes?: string }>(viewer: InboxViewer, requests: T[]): T[] {
  const mine = requests.filter((request) => canSeeRequest(viewer, request));
  const readsNotes = seesEveryRequest(viewer.role) && viewer.canViewNotes !== false;
  return readsNotes ? mine : mine.map((request) => ({ ...request, notes: "" }));
}

// A coach accepts as themselves; the desk chooses the coach.
export function acceptingCoachId(viewer: InboxViewer, chosen: number | null): number | null {
  return seesEveryRequest(viewer.role) ? chosen : viewer.coachId;
}
