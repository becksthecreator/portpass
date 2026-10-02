import { NextResponse } from "next/server";
import { currentWeddingStaffAccount } from "@/app/weddings/staff-auth";
import { completeWedding } from "@/db/billing";
import { isDay } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";

// The Wedding Desk marks a wedding as having happened, and says whether
// the Desk coordinated it. A coordinated wedding earns PortPass its
// coordination fee, once, which goes on the next monthly invoice to the
// wedding business (brief 09, 2.2). Nothing is charged to the couple.
// Saving again corrects it: un-ticking takes the fee off and a new date
// moves it, unless the fee is already on an invoice.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The Desk account that saved it goes in the audit log, not just its role.
  const staff = await currentWeddingStaffAccount();
  if (!staff) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const leadId = Number((await params).id);
  if (!Number.isInteger(leadId) || leadId <= 0) return NextResponse.json({ error: "Invalid enquiry." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { completedOn?: unknown; deskCoordinated?: unknown };
  const completedOn = isDay(body.completedOn) ? body.completedOn : null;
  if (!completedOn || completedOn > nassauToday()) return NextResponse.json({ error: "Enter the date of the wedding. It can't be in the future." }, { status: 400 });
  try {
    const outcome = await completeWedding(leadId, { completedOn, deskCoordinated: body.deskCoordinated === true }, `desk:${staff}`);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "That enquiry no longer exists." }, { status: 404 });
    console.error("wedding completed", message);
    return NextResponse.json({ error: "Could not mark the wedding completed." }, { status: 500 });
  }
}
