// Who sees which private-session request (brief 31, C1). Pure: the inbox
// page, its API routes and the tests agree.
//
// The CEO and admin logins see every request. A coach login sees only the
// requests where their own coach profile is the preferred or the assigned
// coach; a request for "any coach" is the desk's until it is given to one.
// A coach login not linked to a profile, and a helper, see none. A parent's
// free-text notes can carry anything, health details included, so a coach
// gets the request without them (the desk reads them and passes on what
// matters); the session goal stays.

import type { FutprepRole } from "./futprepRoles";

export type InboxViewer = { role: FutprepRole | null; coachId: number | null };

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

export function inboxFor<T extends RequestOwners & { notes?: string }>(viewer: InboxViewer, requests: T[]): T[] {
  const mine = requests.filter((request) => canSeeRequest(viewer, request));
  return seesEveryRequest(viewer.role) ? mine : mine.map((request) => ({ ...request, notes: "" }));
}

// A coach accepts as themselves; the desk chooses the coach.
export function acceptingCoachId(viewer: InboxViewer, chosen: number | null): number | null {
  return seesEveryRequest(viewer.role) ? chosen : viewer.coachId;
}
