import { NextResponse } from "next/server";
import { currentFutprepStaffRole, currentFutprepStaffName } from "@/app/futprep/staff-auth";
import { voidFutprepPayment } from "@/db/staff";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") {
    return NextResponse.json({ error: "Registration admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const paymentId = Number(id);
  if (!Number.isInteger(paymentId)) return NextResponse.json({ error: "Invalid payment." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { reason?: string };
  const voidedBy = (await currentFutprepStaffName()) ?? role;

  try {
    const result = await voidFutprepPayment({
      paymentId,
      voidedBy,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be voided." }, { status: 400 });
  }
}
