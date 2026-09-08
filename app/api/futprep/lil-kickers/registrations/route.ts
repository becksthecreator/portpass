import { NextResponse } from "next/server";
import {
  createFutprepRegistration,
  type FutprepRegistrationInput,
} from "@/db/registrations";

const limits: Record<string, number> = {
  parentName: 120, parentEmail: 180, parentPhone: 40, relationship: 60,
  childName: 120, childDob: 10, gender: 40,
  emergencyContactName: 120, emergencyContactPhone: 40,
  allergies: 1000, medicalConditions: 1000, medications: 1000,
  specialNeeds: 1500, authorizedPickup: 1000, additionalNotes: 1500,
  programSlug: 40, paymentFrequency: 20, paymentMethod: 30,
  photoConsent: 10, signatureName: 120,
};

function clean(body: Record<string, unknown>, field: string) {
  return (typeof body[field] === "string" ? body[field].trim() : "").slice(0, limits[field] ?? 250);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const required = [
    "parentName","parentEmail","parentPhone","relationship","childName","childDob","gender",
    "emergencyContactName","emergencyContactPhone","authorizedPickup","programSlug",
    "paymentFrequency","paymentMethod","photoConsent","signatureName",
  ];

  if (required.some((field) => !clean(body, field))) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  const parentEmail = clean(body, "parentEmail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const programSlug = clean(body, "programSlug");
  if (!programSlug) {
    return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
  }

  const paymentFrequency = clean(body, "paymentFrequency");
  if (!["weekly","term"].includes(paymentFrequency)) {
    return NextResponse.json({ error: "Choose a valid payment frequency." }, { status: 400 });
  }

  const paymentMethod = clean(body, "paymentMethod");
  if (!["cash","bank_transfer","online_banking"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Choose Cash, Bank Transfer, or Online Banking Transfer." }, { status: 400 });
  }

  const photoConsent = clean(body, "photoConsent");
  if (!["yes","no"].includes(photoConsent)) {
    return NextResponse.json({ error: "Please choose a photo/video permission option." }, { status: 400 });
  }

  if (body.consentAccepted !== true) {
    return NextResponse.json({ error: "Parent/guardian consent is required to register." }, { status: 400 });
  }

  const input: FutprepRegistrationInput = {
    parentName: clean(body,"parentName"),
    parentEmail,
    parentPhone: clean(body,"parentPhone"),
    relationship: clean(body,"relationship"),
    childName: clean(body,"childName"),
    childDob: clean(body,"childDob"),
    gender: clean(body,"gender"),
    emergencyContactName: clean(body,"emergencyContactName"),
    emergencyContactPhone: clean(body,"emergencyContactPhone"),
    allergies: clean(body,"allergies"),
    medicalConditions: clean(body,"medicalConditions"),
    medications: clean(body,"medications"),
    specialNeeds: clean(body,"specialNeeds"),
    authorizedPickup: clean(body,"authorizedPickup"),
    additionalNotes: clean(body,"additionalNotes"),
    programSlug: programSlug as FutprepRegistrationInput["programSlug"],
    paymentFrequency: paymentFrequency as FutprepRegistrationInput["paymentFrequency"],
    paymentMethod: paymentMethod as FutprepRegistrationInput["paymentMethod"],
    photoConsent: photoConsent as FutprepRegistrationInput["photoConsent"],
    consentAccepted: true,
    signatureName: clean(body,"signatureName"),
  };

  try {
    const registration = await createFutprepRegistration(input);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PROGRAM" || message === "PROGRAM_NOT_AVAILABLE") return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
    if (message === "AGE_MISMATCH") return NextResponse.json({ error: "The child’s age does not match the selected class." }, { status: 400 });
    if (message === "PROGRAM_FULL") return NextResponse.json({ error: "That class has reached capacity." }, { status: 409 });
    if (message.startsWith("DUPLICATE:")) return NextResponse.json({ error: "A Term 1 registration for this child has already been received.", referenceCode: message.split(":")[1] }, { status: 409 });
    console.error("Futprep registration error", error);
    return NextResponse.json({ error: "We couldn’t complete the registration. Please try again." }, { status: 500 });
  }
}
