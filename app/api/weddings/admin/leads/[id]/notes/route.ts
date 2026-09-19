import { NextResponse } from "next/server";
import { currentWeddingStaffName, currentWeddingStaffRole } from "@/app/weddings/staff-auth";
import { addWeddingLeadNote } from "@/db/weddingAdmin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await currentWeddingStaffRole();
  const staffName = await currentWeddingStaffName();
  if (!role || !staffName) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) return NextResponse.json({ error: "Invalid enquiry." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { note?: string };
  const note = String(body.note ?? "");

  try {
    await addWeddingLeadNote(leadId, staffName, note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOTE_REQUIRED") return NextResponse.json({ error: "Write a note first." }, { status: 400 });
    console.error("Wedding lead note error", error);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
