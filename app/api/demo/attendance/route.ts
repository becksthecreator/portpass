import { NextResponse } from "next/server";
import { ATTENDANCE_STATUSES, markBusinessAttendance } from "@/db/businessAttendance";
import { requireDemoApi } from "@/lib/auth/demo";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

const limited = createRateLimiter(300, 10 * 60_000);

// Mark one of the demo's registers (brief 18, part B). The business is the
// demo, from the demo session; the session and the person must both be its.
export async function POST(request: Request) {
  const auth = await requireDemoApi();
  if (!auth.ok) return auth.response;
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many marks in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown; registrationId?: unknown; status?: unknown } | null;
  const sessionId = Number(body?.sessionId);
  const registrationId = Number(body?.registrationId);
  const status = ATTENDANCE_STATUSES.find((s) => s === body?.status);
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(registrationId) || registrationId <= 0 || !status) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await markBusinessAttendance(auth.org.id, { sessionId, registrationId, status, markedBy: "Demo visitor" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("demo attendance", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "That mark wasn't saved. Try again." }, { status: 500 });
  }
}
