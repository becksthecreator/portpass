import { NextResponse } from "next/server";
import { currentFutprepStaffRole, currentFutprepStaffName } from "@/app/futprep/lil-kickers/staff-auth";
import { markFutprepAttendance } from "@/db/staff";

export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role || role === "helper") return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    sessionId?: number;
    registrationId?: number;
    status?: string;
  };

  if (!Number.isInteger(body.sessionId) || !Number.isInteger(body.registrationId)) {
    return NextResponse.json({ error: "Invalid roster entry." }, { status: 400 });
  }
  if (!["present","absent","excused","late"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "Invalid attendance status." }, { status: 400 });
  }

  const markedBy = (await currentFutprepStaffName()) ?? role;

  try {
    await markFutprepAttendance({
      sessionId: Number(body.sessionId),
      registrationId: Number(body.registrationId),
      status: body.status as "present" | "absent" | "excused" | "late",
      markedBy,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Futprep attendance error", error);
    return NextResponse.json({ error: "Could not save attendance." }, { status: 500 });
  }
}
