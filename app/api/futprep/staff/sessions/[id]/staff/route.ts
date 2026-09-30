import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { getSessionStaff, setSessionStaff } from "@/db/coachPay";
import type { StaffRole } from "@/lib/coachPay";

// Who coached a session (brief 13), recorded from the roster's "Coaches
// today". Names and roles only; pay is never returned here.
async function sessionIdFrom(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sessionId = Number(id);
  return Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const sessionId = await sessionIdFrom(context);
  if (!sessionId) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  return NextResponse.json(await getSessionStaff(sessionId));
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "coach" && role !== "ceo" && role !== "admin") return NextResponse.json({ error: "Coach access required." }, { status: 403 });
  const sessionId = await sessionIdFrom(context);
  if (!sessionId) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { coaches?: unknown };
  if (!Array.isArray(body.coaches)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const coaches = (body.coaches as Array<{ coachId?: unknown; role?: unknown }>).map((entry) => ({
    coachId: Number(entry.coachId),
    role: (entry.role === "assistant" ? "assistant" : entry.role === "lead" ? "lead" : "") as StaffRole,
  }));
  try {
    const entries = await setSessionStaff(sessionId, coaches, (await currentFutprepStaffName()) ?? role);
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_STAFF") return NextResponse.json({ error: "Choose coaches from the list, each as lead or assistant." }, { status: 400 });
    if (message === "PAID_ROW_LOCKED") return NextResponse.json({ error: "A coach already paid for this session can't be removed or changed." }, { status: 409 });
    if (message === "SESSION_NOT_FOUND") return NextResponse.json({ error: "Session not found." }, { status: 404 });
    console.error("session staff error", error);
    return NextResponse.json({ error: "Could not save who coached." }, { status: 500 });
  }
}
