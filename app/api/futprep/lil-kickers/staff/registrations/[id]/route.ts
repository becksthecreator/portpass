import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import { updateFutprepRegistration } from "@/db/staff";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") {
    return NextResponse.json({ error: "Registration admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const registrationId = Number(id);
  const body = await request.json().catch(() => ({})) as {
    registrationStatus?: string;
    paymentStatus?: string;
  };

  const registrationStatuses = ["pending","confirmed","cancelled"];
  const paymentStatuses = ["pending","partial","paid","overdue","waived"];

  if (!Number.isInteger(registrationId)) return NextResponse.json({ error: "Invalid registration." }, { status: 400 });
  if (body.registrationStatus && !registrationStatuses.includes(body.registrationStatus)) {
    return NextResponse.json({ error: "Invalid registration status." }, { status: 400 });
  }
  if (body.paymentStatus && !paymentStatuses.includes(body.paymentStatus)) {
    return NextResponse.json({ error: "Invalid payment status." }, { status: 400 });
  }

  try {
    await updateFutprepRegistration({
      registrationId,
      registrationStatus: body.registrationStatus as "pending" | "confirmed" | "cancelled" | undefined,
      paymentStatus: body.paymentStatus as "pending" | "partial" | "paid" | "overdue" | "waived" | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }
}
