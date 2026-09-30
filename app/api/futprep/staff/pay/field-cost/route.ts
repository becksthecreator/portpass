import { NextResponse } from "next/server";
import { resolvePayAccess } from "@/app/futprep/staff/pay/access";
import { setProgramFieldCost } from "@/db/coachPay";

// Field hire per term for a program, from the P&L on the Coach pay page
// (brief 13). Alex and platform owners only; audit-logged.
export async function PATCH(request: Request) {
  const access = await resolvePayAccess();
  if (!access || access.kind !== "all") return NextResponse.json({ error: "Only Alex can set the field cost." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { programId?: unknown; cents?: unknown };
  const programId = Number(body.programId);
  const cents = body.cents === null || body.cents === "" || body.cents === undefined ? null : Number(body.cents);
  if (!Number.isInteger(programId) || (cents !== null && (!Number.isInteger(cents) || cents < 0))) {
    return NextResponse.json({ error: "Enter the field cost in dollars, or leave it blank." }, { status: 400 });
  }
  try {
    await setProgramFieldCost({ programId, cents, actor: access.actor });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_AMOUNT") return NextResponse.json({ error: "Enter the field cost in dollars, or leave it blank." }, { status: 400 });
    if (message === "PROGRAM_NOT_FOUND") return NextResponse.json({ error: "Program not found." }, { status: 404 });
    console.error("field cost error", error);
    return NextResponse.json({ error: "Could not save the field cost." }, { status: 500 });
  }
}
