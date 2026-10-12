import "server-only";
import { coachForStaffMember } from "@/db/coachPay";
import { listPrivateSessionRequests, type PrivateSessionRequest } from "@/db/coaches";
import { inboxFor, seesEveryRequest, type InboxViewer } from "@/lib/privateSessionAccess";
import { currentFutprepStaffAccount, currentFutprepStaffCanViewMedical, currentFutprepStaffId, currentFutprepStaffRole } from "../../staff-auth";

// Who is looking at the private-session inbox (brief 31, C1): the staff
// login's role and the coach profile tied to it (Team -> Coach pay links
// them), if any. A coach login with no profile sees no requests.
export async function currentInboxViewer(): Promise<{ account: string | null; viewer: InboxViewer }> {
  const [account, role, staffId] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole(), currentFutprepStaffId()]);
  if (!account || !role) return { account: null, viewer: { role: null, coachId: null } };
  const [coach, canViewNotes] = await Promise.all([staffId ? coachForStaffMember(staffId).catch(() => null) : Promise.resolve(null), currentFutprepStaffCanViewMedical()]);
  return { account, viewer: { role, coachId: coach?.id ?? null, canViewNotes } };
}

// The viewer's own inbox: every request for the CEO and admins; a coach's
// own (asked of the database by coach, then checked again) without the
// parent's notes; nothing for anyone else.
export async function inboxRequests(viewer: InboxViewer): Promise<{ schemaReady: boolean; requests: PrivateSessionRequest[] }> {
  if (!seesEveryRequest(viewer.role) && (viewer.role !== "coach" || viewer.coachId === null)) {
    return { schemaReady: true, requests: [] };
  }
  const result = await listPrivateSessionRequests(seesEveryRequest(viewer.role) ? {} : { coachId: viewer.coachId! });
  return { schemaReady: result.schemaReady, requests: inboxFor(viewer, result.requests) };
}
