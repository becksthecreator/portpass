import { NextResponse } from "next/server";
import { currentFutprepStaffCanViewMedical, currentFutprepStaffRole, currentFutprepStaffName } from "@/app/futprep/staff-auth";
import { withoutEmergencyInput, withoutHealthInput } from "@/lib/futprepRoles";
import { updateFutprepRegistrationDetail, type FutprepRegistrationDetailInput } from "@/db/staff";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") {
    return NextResponse.json({ error: "Registration admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const registrationId = Number(id);
  if (!Number.isInteger(registrationId)) return NextResponse.json({ error: "Invalid registration." }, { status: 400 });

  const sent = await request.json().catch(() => ({})) as FutprepRegistrationDetailInput;
  // Brief 31 (A1): a login that may not see the health fields never
  // changes them, whatever the request carries. Brief 34: nor the
  // emergency contact and pickup, which follow the same switch.
  const body = (await currentFutprepStaffCanViewMedical()) ? sent : withoutEmergencyInput(withoutHealthInput(sent));
  const staffName = (await currentFutprepStaffName()) ?? role;

  try {
    await updateFutprepRegistrationDetail(registrationId, body, staffName);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // A move into a full class is refused under that class's lock
    // (migration 202610280010): nothing was saved.
    if (message === "PROGRAM_FULL") return NextResponse.json({ error: "That class is full, so the child wasn't moved and nothing was saved. Choose another class, or free a place first." }, { status: 409 });
    if (message === "INVALID_PROGRAM" || message === "PROGRAM_NOT_AVAILABLE") return NextResponse.json({ error: "Choose a class with an open term." }, { status: 400 });
    return NextResponse.json({ error: message || "Could not save changes." }, { status: 400 });
  }
}
