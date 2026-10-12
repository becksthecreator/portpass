import { NextResponse } from "next/server";
import { currentInboxViewer, inboxRequests } from "@/app/futprep/staff/private-sessions/viewer";
import { actOnPrivateSessionRequest, privateSessionOwners } from "@/db/coaches";
import { bodyOf, readJson } from "@/lib/api/body";
import { acceptingCoachId, canActOnRequest, canSeeRequest } from "@/lib/privateSessionAccess";

const Body = bodyOf(["action", "coachId", "targetCoachId", "reason"]);
const ACTIONS = ["accept", "decline", "refer", "parent_notified", "complete"] as const;

// Accept, decline, refer, note the parent was told, or complete a private
// session request. Brief 31 (C1): a coach acts only on their own requests
// (preferred or assigned), and accepts as themselves; another coach's
// request answers 404, as if it weren't there. The CEO and admins act on
// any. The answer is the viewer's own inbox.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { account, viewer } = await currentInboxViewer();
  if (!account || !viewer.role || viewer.role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const requestId = Number((await params).id);
  if (!Number.isInteger(requestId) || requestId < 1) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body = read.value;
  const action = ACTIONS.find((a) => a === body.action);
  if (!action) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const owners = await privateSessionOwners(requestId);
  if (!owners || !canSeeRequest(viewer, owners)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!canActOnRequest(viewer, owners)) return NextResponse.json({ error: "This request is with another coach now." }, { status: 403 });
  try {
    await actOnPrivateSessionRequest({ id: requestId, action, coachId: acceptingCoachId(viewer, Number(body.coachId) || null), targetCoachId: Number(body.targetCoachId) || null, reason: String(body.reason ?? ""), actor: account });
    const { requests } = await inboxRequests(viewer);
    return NextResponse.json({ ok: true, requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update request.";
    if (message === "DECLINE_REASON_REQUIRED") return NextResponse.json({ error: "A reason is required when declining a session." }, { status: 400 });
    if (message === "COACH_REQUIRED") return NextResponse.json({ error: "Choose a coach first." }, { status: 400 });
    if (message === "SLOT_TAKEN") return NextResponse.json({ error: "That time is already booked. Decline or refer this request, or agree a new time with the parent." }, { status: 409 });
    if (message === "NOT_ACCEPTED") return NextResponse.json({ error: "Accept the session before marking it completed." }, { status: 409 });
    if (message === "REQUEST_NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (message === "NOT_YET") return NextResponse.json({ error: "Mark a session completed on or after its day." }, { status: 409 });
    if (message === "COMPLETED") return NextResponse.json({ error: "This session is completed; it can't change now." }, { status: 409 });
    if (message === "COACH_NOT_AVAILABLE") return NextResponse.json({ error: "Choose one of Futprep's coaches." }, { status: 400 });
    if (message === "COACH_AWAY") return NextResponse.json({ error: "That coach is away that day. Refer it to another coach." }, { status: 409 });
    return NextResponse.json({ error: "Could not update the session request." }, { status: 500 });
  }
}
