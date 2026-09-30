import { NextResponse } from "next/server";
import { resolvePayAccess } from "@/app/futprep/staff/pay/access";
import { markCoachMonthPaid } from "@/db/coachPay";

// "Mark paid" on the Coach pay page (brief 13): every unpaid session one
// coach coached in one month. Alex and platform owners only; audit-logged.
export async function POST(request: Request) {
  const access = await resolvePayAccess();
  if (!access || access.kind !== "all") return NextResponse.json({ error: "Only Alex can mark pay as paid." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { coachId?: unknown; month?: unknown };
  const coachId = Number(body.coachId);
  const month = typeof body.month === "string" ? body.month : "";
  if (!Number.isInteger(coachId) || coachId < 1 || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    return NextResponse.json(await markCoachMonthPaid({ coachId, month, actor: access.actor }));
  } catch (error) {
    console.error("coach pay mark-paid error", error);
    return NextResponse.json({ error: "Could not mark the pay as paid." }, { status: 500 });
  }
}
