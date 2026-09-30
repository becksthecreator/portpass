import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { setSessionCoaches } from "@/db/staff";

// "Coaches today" on the roster (brief 12): how many coaches are on duty
// for one session, which sets that session's cap (coaches × children per
// coach, never above capacity). { coaches: null } goes back to the
// program's default. Helpers are read-only and can't change it.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "coach" && role !== "ceo" && role !== "admin") {
    return NextResponse.json({ error: "Coach access required." }, { status: 403 });
  }
  const { id } = await context.params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId < 1) return NextResponse.json({ error: "Invalid session." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { coaches?: unknown };
  const coaches = body.coaches === null ? null : Number(body.coaches);
  if (coaches !== null && (!Number.isInteger(coaches) || coaches < 0 || coaches > 20)) {
    return NextResponse.json({ error: "Coaches must be a whole number from 0 to 20." }, { status: 400 });
  }

  try {
    return NextResponse.json(await setSessionCoaches(sessionId, coaches));
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") return NextResponse.json({ error: "Session not found." }, { status: 404 });
    console.error("session coaches error", error);
    return NextResponse.json({ error: "Could not save the coaches on duty." }, { status: 500 });
  }
}
