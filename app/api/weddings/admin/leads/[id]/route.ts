import { NextResponse } from "next/server";
import { currentWeddingStaffRole } from "@/app/weddings/staff-auth";
import { updateWeddingLeadStatus, WEDDING_LEAD_STATUSES } from "@/db/weddingAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await currentWeddingStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) return NextResponse.json({ error: "Invalid enquiry." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !(WEDDING_LEAD_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
  }

  try {
    await updateWeddingLeadStatus(leadId, body.status as (typeof WEDDING_LEAD_STATUSES)[number]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Wedding lead status update error", error);
    return NextResponse.json({ error: "Could not update the enquiry." }, { status: 500 });
  }
}
