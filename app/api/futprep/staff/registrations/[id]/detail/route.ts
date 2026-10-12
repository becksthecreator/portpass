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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save changes." }, { status: 400 });
  }
}
