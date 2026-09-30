import { NextResponse } from "next/server";
import { resolvePayAccess } from "@/app/futprep/staff/pay/access";
import { setCoachPayDefaults } from "@/db/coachPay";

function cents(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : "invalid";
}

// A coach's default pay per class as lead and as assistant, and which staff
// login is theirs (brief 13). Alex and platform owners only; audit-logged.
export async function PATCH(request: Request) {
  const access = await resolvePayAccess();
  if (!access || access.kind !== "all") return NextResponse.json({ error: "Only Alex can set pay rates." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { coachId?: unknown; leadCents?: unknown; assistantCents?: unknown; staffMemberId?: unknown };
  const coachId = Number(body.coachId);
  const leadCents = cents(body.leadCents);
  const assistantCents = cents(body.assistantCents);
  const staffMemberId = body.staffMemberId === null || body.staffMemberId === "" || body.staffMemberId === undefined ? null : Number(body.staffMemberId);
  if (!Number.isInteger(coachId) || leadCents === "invalid" || assistantCents === "invalid" || (staffMemberId !== null && !Number.isInteger(staffMemberId))) {
    return NextResponse.json({ error: "Enter pay as dollars, 0 to 1,000." }, { status: 400 });
  }
  try {
    return NextResponse.json({ coach: await setCoachPayDefaults({ coachId, leadCents, assistantCents, staffMemberId, actor: access.actor }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "STAFF_ALREADY_LINKED") return NextResponse.json({ error: "That staff login already belongs to another coach." }, { status: 409 });
    if (message === "COACH_NOT_FOUND") return NextResponse.json({ error: "Coach not found." }, { status: 404 });
    console.error("coach pay rates error", error);
    return NextResponse.json({ error: "Could not save the pay rates." }, { status: 500 });
  }
}
