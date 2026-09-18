import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { createFutprepRegistration, type FutprepRegistrationInput } from "@/db/registrations";
import { sendFutprepRegistrationReceivedEmail } from "@/lib/email";

const limits: Record<string, number> = {
  parentName: 120, parentEmail: 180, parentPhone: 40, relationship: 60,
  childName: 120, childDob: 10, gender: 40,
  emergencyContactName: 120, emergencyContactPhone: 40,
  authorizedPickup: 1000, additionalNotes: 1500,
  programSlug: 40, paymentFrequency: 20, paymentMethod: 30, photoConsent: 10,
};

function clean(body: Record<string, unknown>, field: string) {
  return (typeof body[field] === "string" ? body[field].trim() : "").slice(0, limits[field] ?? 250);
}

// Staff fast-add: migrating already-enrolled children (real kids attending
// real sessions with zero registration rows) needs a path that skips the
// full parent-facing medical/consent wizard - the family already agreed to
// participate before PortPass existed. Emergency contact and authorized
// pickup default to the parent's own info when left blank rather than
// blocking on data nobody's collected yet; photo consent still has no
// default since that's a real per-family choice. Full medical/allergy
// detail stays blank here and gets collected from the family afterward.
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

  const required = [
    "parentName", "parentEmail", "parentPhone", "childName", "childDob", "gender",
    "programSlug", "paymentFrequency", "paymentMethod", "photoConsent",
  ];
  if (required.some((field) => !clean(body, field))) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  const parentEmail = clean(body, "parentEmail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return NextResponse.json({ error: "Please enter a valid parent email address." }, { status: 400 });
  }

  const programSlug = clean(body, "programSlug");
  const paymentFrequency = clean(body, "paymentFrequency");
  if (!["weekly", "term"].includes(paymentFrequency)) {
    return NextResponse.json({ error: "Choose a valid payment frequency." }, { status: 400 });
  }
  const paymentMethod = clean(body, "paymentMethod");
  if (!["cash", "bank_transfer", "online_banking"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Choose Cash, Bank Transfer, or Online Banking Transfer." }, { status: 400 });
  }
  const photoConsent = clean(body, "photoConsent");
  if (!["yes", "no"].includes(photoConsent)) {
    return NextResponse.json({ error: "Please choose a photo/video permission option." }, { status: 400 });
  }
  if (body.staffAcknowledged !== true) {
    return NextResponse.json({ error: "Confirm the family has already agreed to participate before saving." }, { status: 400 });
  }

  const parentName = clean(body, "parentName");
  const parentPhone = clean(body, "parentPhone");
  const emergencyContactName = clean(body, "emergencyContactName") || parentName;
  const emergencyContactPhone = clean(body, "emergencyContactPhone") || parentPhone;
  const authorizedPickup = clean(body, "authorizedPickup") || parentName;

  const input: FutprepRegistrationInput = {
    parentName,
    parentEmail,
    parentPhone,
    relationship: clean(body, "relationship") || "Parent",
    childName: clean(body, "childName"),
    childDob: clean(body, "childDob"),
    gender: clean(body, "gender"),
    emergencyContactName,
    emergencyContactPhone,
    allergies: "",
    medicalConditions: "",
    medications: "",
    specialNeeds: "",
    authorizedPickup,
    additionalNotes: clean(body, "additionalNotes"),
    programSlug: programSlug as FutprepRegistrationInput["programSlug"],
    paymentFrequency: paymentFrequency as FutprepRegistrationInput["paymentFrequency"],
    paymentMethod: paymentMethod as FutprepRegistrationInput["paymentMethod"],
    photoConsent: photoConsent as FutprepRegistrationInput["photoConsent"],
    consentAccepted: true,
    signatureName: staffName ? `Staff entry — ${staffName}` : "Staff entry",
    enteredByStaff: staffName ?? "unknown staff",
    ageOverrideConfirmed: body.ageOverrideConfirmed === true,
  };

  try {
    const registration = await createFutprepRegistration(input);
    sendFutprepRegistrationReceivedEmail({
      parentEmail: input.parentEmail,
      parentName: input.parentName,
      childName: input.childName,
      programName: registration.program.name,
      day: registration.program.day,
      time: registration.program.time,
      endTime: registration.program.endTime,
      location: registration.term.location,
      amountDueCents: registration.amountDueCents,
      referenceCode: registration.referenceCode,
      statusUrl: `${new URL(request.url).origin}/futprep/my/${registration.referenceCode}`,
    }).catch((error) => console.error("Futprep staff-entry registration email error", error));
    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PROGRAM" || message === "PROGRAM_NOT_AVAILABLE") return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
    if (message === "AGE_MISMATCH") return NextResponse.json({ error: "AGE_MISMATCH", needsAgeOverride: true }, { status: 409 });
    if (message === "PROGRAM_FULL") return NextResponse.json({ error: "That class has reached capacity." }, { status: 409 });
    if (message.startsWith("DUPLICATE:")) return NextResponse.json({ error: "A Term 1 registration for this child already exists.", referenceCode: message.split(":")[1] }, { status: 409 });
    console.error("Futprep staff registration error", error);
    return NextResponse.json({ error: "Could not save this registration. Please try again." }, { status: 500 });
  }
}
