import { NextResponse } from "next/server";
import { currentFutprepStaffRole, currentFutprepStaffAccount } from "@/app/futprep/staff-auth";
import { clearFutprepAttendance, markFutprepAttendance } from "@/db/staff";

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

  // account_key, not display name: names change, the login identity
  // doesn't, and this is the column that becomes a real FK to auth.users
  // once the auth foundation (block C) lands.
  const markedBy = (await currentFutprepStaffAccount()) ?? role;

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

// "Tap again to undo": deletes the mark rather than writing a fifth
// status, since rosterForSession already treats a missing row as
// unmarked.
export async function DELETE(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role || role === "helper") return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    sessionId?: number;
    registrationId?: number;
  };
  if (!Number.isInteger(body.sessionId) || !Number.isInteger(body.registrationId)) {
    return NextResponse.json({ error: "Invalid roster entry." }, { status: 400 });
  }

  try {
    await clearFutprepAttendance({ sessionId: Number(body.sessionId), registrationId: Number(body.registrationId) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Futprep attendance clear error", error);
    return NextResponse.json({ error: "Could not clear attendance." }, { status: 500 });
  }
}
