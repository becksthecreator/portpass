import { NextResponse } from "next/server";
import { currentFutprepStaffRole, currentFutprepStaffName } from "@/app/futprep/staff-auth";
import { updateFutprepRegistrationDetail, type FutprepRegistrationDetailInput } from "@/db/staff";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") {
    return NextResponse.json({ error: "Registration admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const registrationId = Number(id);
  if (!Number.isInteger(registrationId)) return NextResponse.json({ error: "Invalid registration." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as FutprepRegistrationDetailInput;
  const staffName = (await currentFutprepStaffName()) ?? role;

  try {
    await updateFutprepRegistrationDetail(registrationId, body, staffName);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save changes." }, { status: 400 });
  }
}
