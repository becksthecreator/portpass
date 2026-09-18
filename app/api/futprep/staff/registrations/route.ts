import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { createFutprepPendingRegistration } from "@/db/registrations";

const limits: Record<string, number> = {
  childName: 120, programSlug: 40, parentName: 120, parentPhone: 40, parentEmail: 180,
};

function clean(body: Record<string, unknown>, field: string) {
  return (typeof body[field] === "string" ? body[field].trim() : "").slice(0, limits[field] ?? 250);
}

// Staff fast-add: migrating an already-enrolled child (real kids attending
// real sessions with zero registration rows) needs only a name and a class
// to get them onto the roster. Nothing else is asked or defaulted here -
// the parent supplies everything else (DOB, emergency contact, medical
// info, consent) at /futprep/my/[code]/complete.
export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") {
    return NextResponse.json({ error: "Registration admin access required." }, { status: 403 });
  }
  const staffName = await currentFutprepStaffName();

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const childName = clean(body, "childName");
  const programSlug = clean(body, "programSlug");
  if (!childName || !programSlug) {
    return NextResponse.json({ error: "Enter the child's name and choose a class." }, { status: 400 });
  }

  const parentEmail = clean(body, "parentEmail");
  if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return NextResponse.json({ error: "Enter a valid parent email address, or leave it blank." }, { status: 400 });
  }

  try {
    const { referenceCode } = await createFutprepPendingRegistration({
      childName,
      programSlug,
      parentName: clean(body, "parentName") || undefined,
      parentPhone: clean(body, "parentPhone") || undefined,
      parentEmail: parentEmail || undefined,
      enteredByStaff: staffName ?? "unknown staff",
    });
    return NextResponse.json({ referenceCode }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PROGRAM" || message === "PROGRAM_NOT_AVAILABLE") return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
    if (message === "PROGRAM_FULL") return NextResponse.json({ error: "That class has reached capacity." }, { status: 409 });
    if (message.startsWith("DUPLICATE:")) return NextResponse.json({ error: "A registration for this child already exists.", referenceCode: message.split(":")[1] }, { status: 409 });
    console.error("Futprep staff pending-registration error", error);
    return NextResponse.json({ error: "Could not add this child. Please try again." }, { status: 500 });
  }
}
