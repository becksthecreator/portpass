import { NextResponse } from "next/server";
import {
  createFutprepRegistration,
  type FutprepRegistrationInput,
} from "@/db/registrations";
import { cleanHost, isHeardAnswer } from "@/lib/attribution";
import { getSession } from "@/lib/auth/session";
import { sendFutprepRegistrationReceivedEmail } from "@/lib/email";
import { normalizePhoneE164 } from "@/lib/phone";

// Phones are stored as E.164 when they can be read as a number (the form
// sends them that way); anything else is kept as typed rather than
// rejected, so a registration is never lost over a phone format.
function phone(body: Record<string, unknown>, field: string): string {
  const raw = clean(body, field);
  return normalizePhoneE164(raw) ?? raw;
}

const limits: Record<string, number> = {
  parentName: 120, parentEmail: 180, parentPhone: 40, relationship: 60,
  childName: 120, childDob: 10, gender: 40,
  emergencyContactName: 120, emergencyContactPhone: 40,
  allergies: 1000, medicalConditions: 1000, medications: 1000,
  specialNeeds: 1500, authorizedPickup: 1000, additionalNotes: 1500,
  programSlug: 40, paymentFrequency: 20, paymentMethod: 30,
  photoConsent: 10, signatureName: 120,
  // Growth tracking (28 Sept): the parent's answer, an optional referral
  // code, and the attribution the page read from the cookie / URL.
  heardAboutUs: 40, referralCode: 40, utmSource: 80, utmMedium: 80, utmCampaign: 80, referrerHost: 120,
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

  // Part C (brief 06 v2): a free trial and a waitlist entry owe nothing
  // yet, so they don't ask how the parent will pay.
  const mode = body.mode === "trial" ? "trial" : body.mode === "waitlist" ? "waitlist" : "standard";
  if (mode !== "standard") {
    if (!clean(body, "paymentFrequency")) body.paymentFrequency = "weekly";
    if (!clean(body, "paymentMethod")) body.paymentMethod = "cash";
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

  const heardAboutUs = clean(body, "heardAboutUs");
  if (!isHeardAnswer(heardAboutUs)) {
    return NextResponse.json({ error: "Tell us how you heard about Futprep." }, { status: 400 });
  }

  const input: FutprepRegistrationInput = {
    parentName: clean(body,"parentName"),
    parentEmail,
    parentPhone: phone(body,"parentPhone"),
    relationship: clean(body,"relationship"),
    childName: clean(body,"childName"),
    childDob: clean(body,"childDob"),
    gender: clean(body,"gender"),
    emergencyContactName: clean(body,"emergencyContactName"),
    emergencyContactPhone: phone(body,"emergencyContactPhone"),
    allergies: clean(body,"allergies"),
    medicalConditions: clean(body,"medicalConditions"),
    medications: clean(body,"medications"),
    specialNeeds: clean(body,"specialNeeds"),
    authorizedPickup: clean(body,"authorizedPickup"),
    additionalNotes: clean(body,"additionalNotes"),
    programSlug: programSlug as FutprepRegistrationInput["programSlug"],
    termId: Number.isInteger(Number(body.termId)) && Number(body.termId) > 0 ? Number(body.termId) : null,
    paymentFrequency: paymentFrequency as FutprepRegistrationInput["paymentFrequency"],
    paymentMethod: paymentMethod as FutprepRegistrationInput["paymentMethod"],
    photoConsent: photoConsent as FutprepRegistrationInput["photoConsent"],
    consentAccepted: true,
    signatureName: clean(body,"signatureName"),
    heardAboutUs,
    referralCode: clean(body, "referralCode") || null,
    mode,
    returnToken: typeof body.returnToken === "string" ? body.returnToken.slice(0, 80) : null,
    trialSessionId: Number.isInteger(Number(body.trialSessionId)) && Number(body.trialSessionId) > 0 ? Number(body.trialSessionId) : null,
    joinFromTrialCode: typeof body.joinFromTrialCode === "string" ? body.joinFromTrialCode.slice(0, 40) : null,
    // A free trial is a member perk: only for a signed-in parent. The
    // session comes from the cookie, never the request body.
    signedInUserId: mode === "trial" ? (await getSession())?.userId ?? null : null,
    attribution: {
      utmSource: clean(body, "utmSource") || null,
      utmMedium: clean(body, "utmMedium") || null,
      utmCampaign: clean(body, "utmCampaign") || null,
      referrerHost: cleanHost(clean(body, "referrerHost")),
      viaPortpass: body.viaPortpass === true,
    },
  };

  try {
    const registration = await createFutprepRegistration(input);
    // The "registration received" email carries an amount due and payment
    // instructions, so it goes only for a real place; a waitlist entry or
    // a free trial gets its confirmation on screen.
    if (registration.registrationStatus === "pending") sendFutprepRegistrationReceivedEmail({
      parentEmail: input.parentEmail,
      parentName: input.parentName,
      childName: input.childName,
      programName: `${registration.program.name} · ${registration.term.name}`,
      day: registration.program.day,
      time: registration.program.time,
      endTime: registration.program.endTime,
      location: registration.term.location,
      amountDueCents: registration.amountDueCents,
      referenceCode: registration.referenceCode,
      statusUrl: `${new URL(request.url).origin}/futprep/my/${registration.referenceCode}`,
    }).catch((error) => console.error("Futprep registration email error", error));
    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PROGRAM" || message === "PROGRAM_NOT_AVAILABLE") return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
    if (message === "AGE_MISMATCH") return NextResponse.json({ error: "The child’s age does not match the selected class." }, { status: 400 });
    if (message === "TRIAL_SIGN_IN_REQUIRED") return NextResponse.json({ error: "Sign in to PortPass to book the free Saturday." }, { status: 401 });
    if (message === "TRIAL_NOT_AVAILABLE") return NextResponse.json({ error: "That Saturday isn't one of the free-trial days. Choose another." }, { status: 400 });
    if (message === "TRIAL_FULL") return NextResponse.json({ error: "The free-trial spots for that Saturday are taken. Choose the other Saturday." }, { status: 409 });
    if (message === "TRIAL_ALREADY_USED") return NextResponse.json({ error: "This child has already had a free Saturday. Register for the term to keep playing." }, { status: 409 });
    if (message === "RETURN_LINK_INVALID") return NextResponse.json({ error: "This early-access link isn't valid any more. Message Futprep on WhatsApp for a new one." }, { status: 400 });
    if (message === "JOIN_LINK_INVALID") return NextResponse.json({ error: "This join link doesn't match the class. Message Futprep on WhatsApp." }, { status: 400 });
    if (message === "TERM_CLOSED") return NextResponse.json({ error: "Registration for that session has closed. Message Futprep on WhatsApp if you still need a spot." }, { status: 409 });
    if (message === "SPOT_OPEN") return NextResponse.json({ error: "Good news: a spot has just opened in this class. Reload the page to register for it." }, { status: 409 });
    if (message === "PROGRAM_FULL") return NextResponse.json({ error: "That class has reached capacity." }, { status: 409 });
    if (message.startsWith("DUPLICATE:")) return NextResponse.json({ error: "A registration for this child has already been received for this session.", referenceCode: message.split(":")[1] }, { status: 409 });
    console.error("Futprep registration error", error);
    return NextResponse.json({ error: "We couldn’t complete the registration. Please try again." }, { status: 500 });
  }
}
