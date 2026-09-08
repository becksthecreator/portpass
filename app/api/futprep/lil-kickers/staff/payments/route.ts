import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import { recordFutprepPayment } from "@/db/staff";
import { sendFutprepPaymentRecordedEmail } from "@/lib/email";

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
  if (body.method !== "cash" && body.method !== "bank_transfer" && body.method !== "online_banking") {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (role === "coach" && body.method !== "cash") {
    return NextResponse.json({ error: "Coach Bex can record cash payments only." }, { status: 403 });
  }

  const recordedBy =
    role === "admin"
      ? "Kiki / Futprep registration"
      : role === "ceo"
        ? "Coach Alex / Futprep CEO"
        : "Coach Bex";

  try {
    const result = await recordFutprepPayment({
      registrationId: Number(body.registrationId),
      amountCents: Number(body.amountCents),
      method: body.method,
      recordedBy,
      note: typeof body.note === "string" ? body.note.slice(0,500) : "",
    });
    sendFutprepPaymentRecordedEmail({
      parentEmail: result.parentEmail,
      parentName: result.parentName,
      childName: result.childName,
      amountRecordedCents: Number(body.amountCents),
      balanceCents: Math.max(0, result.amountDueCents - result.paidCents),
      paymentStatus: result.paymentStatus,
      statusUrl: `${new URL(request.url).origin}/futprep/my`,
    }).catch((error) => console.error("Futprep payment email error", error));
    return NextResponse.json({ ok: true, paidCents: result.paidCents, paymentStatus: result.paymentStatus });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be recorded." }, { status: 400 });
  }
}
