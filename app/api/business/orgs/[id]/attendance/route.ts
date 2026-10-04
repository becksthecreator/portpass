import { NextResponse } from "next/server";
import { ATTENDANCE_STATUSES, markBusinessAttendance } from "@/db/businessAttendance";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(600, 10 * 60_000);

// Mark one person for one of this business's sessions (brief 18, part B).
// Team members only; the session and the person must both be the
// business's own.
export async function POST(request: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many marks in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown; registrationId?: unknown; status?: unknown } | null;
  const sessionId = Number(body?.sessionId);
  const registrationId = Number(body?.registrationId);
  const status = ATTENDANCE_STATUSES.find((s) => s === body?.status);
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(registrationId) || registrationId <= 0 || !status) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await markBusinessAttendance(id, { sessionId, registrationId, status, markedBy: auth.session.profile?.fullName?.trim() || auth.session.email || "Team member" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("business attendance", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "That mark wasn't saved. Try again." }, { status: 500 });
  }
}
