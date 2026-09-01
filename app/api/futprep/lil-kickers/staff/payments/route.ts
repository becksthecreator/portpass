import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import { recordFutprepPayment } from "@/db/staff";

export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    registrationId?: number;
    amountCents?: number;
    method?: string;
    note?: string;
  };

  if (!Number.isInteger(body.registrationId) || !Number.isInteger(body.amountCents) || Number(body.amountCents) <= 0) {
    return NextResponse.json({ error: "Enter a valid payment amount." }, { status: 400 });
  }
  if (body.method !== "cash" && body.method !== "bank_transfer") {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (role === "coach" && body.method !== "cash") {
    return NextResponse.json({ error: "Coach access can record cash payments only." }, { status: 403 });
  }

  try {
    const result = await recordFutprepPayment({
      registrationId: Number(body.registrationId),
      amountCents: Number(body.amountCents),
      method: body.method,
      recordedBy: role === "admin" ? "Kiki / Futprep admin" : "Coach Bex",
      note: typeof body.note === "string" ? body.note.slice(0,500) : "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be recorded." }, { status: 400 });
  }
}
