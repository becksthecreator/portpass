import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import { markFutprepAttendance } from "@/db/staff";

export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    sessionId?: number;
    registrationId?: number;
    status?: string;
  };

  if (!Number.isInteger(body.sessionId) || !Number.isInteger(body.registrationId)) {
    return NextResponse.json({ error: "Invalid roster entry." }, { status: 400 });
  }
  if (!["present","absent","excused"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "Invalid attendance status." }, { status: 400 });
  }

  await markFutprepAttendance({
    sessionId: Number(body.sessionId),
    registrationId: Number(body.registrationId),
    status: body.status as "present" | "absent" | "excused",
    markedBy: role === "admin" ? "Futprep admin" : "Coach Bex",
  });
  return NextResponse.json({ ok: true });
}
