import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { getProgramAudience, getRegistrationBusiness } from "@/db/registrationBusiness";
import { createFutprepRegistration, type FutprepRegistrationInput } from "@/db/registrations";
import { afterResponse } from "@/lib/afterResponse";
import { cleanHost, isHeardAnswer } from "@/lib/attribution";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { normalizePhoneE164 } from "@/lib/phone";
import { CONSENT_VERSION_ADULT, CONSENT_VERSION_CHILD, GENERIC_REFERENCE_PREFIX, isAdultRegistration } from "@/lib/registrations/business";
import { sendRegistrationReceivedEmail } from "@/lib/registrations/email";

// @public-route: registering for a business's class or camp needs no account.
//
// Registration for any business (brief 18, D1). The same rules and the
// same table as Futprep's own form (capacity, waitlist, ages in months,
// duplicates, what is owed: db/registrations.ts), for the business named
// in the request, which must be public. Futprep keeps its own endpoint
// and is refused here, so nothing about its flow changes.
//
// An adults' programme asks for no guardian, emergency or health details,
// and none are stored even if sent (brief 18, D3).

const limits: Record<string, number> = {
  organizationSlug: 80, programSlug: 40,
  parentName: 120, parentEmail: 180, parentPhone: 40, relationship: 60,
  childName: 120, childDob: 10, gender: 40,
  emergencyContactName: 120, emergencyContactPhone: 40,
  allergies: 1000, medicalConditions: 1000, medications: 1000,
  specialNeeds: 1500, authorizedPickup: 1000, additionalNotes: 1500,
  paymentFrequency: 20, paymentMethod: 30, photoConsent: 10, signatureName: 120,
  heardAboutUs: 40, referralCode: 40, utmSource: 80, utmMedium: 80, utmCampaign: 80, referrerHost: 120,
};

// Each submission emails the address typed, so the form is limited per
// network address and per email (in memory, per server instance).
const perAddress = createRateLimiter(30, 10 * 60 * 1000);
const perEmail = createRateLimiter(6, 10 * 60 * 1000);

function clean(body: Record<string, unknown>, field: string): string {
  return (typeof body[field] === "string" ? body[field].trim() : "").slice(0, limits[field] ?? 250);
}

function phone(body: Record<string, unknown>, field: string): string {
  const raw = clean(body, field);
  return normalizePhoneE164(raw) ?? raw;
}

const refuse = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["parentName", "parentEmail", "parentPhone", "relationship", "childName", "childDob", "gender", "authorizedPickup", "emergencyContactName", "emergencyContactPhone", "allergies", "medicalConditions", "medications", "specialNeeds", "additionalNotes", "offerKey", "participant", "paymentFrequency", "paymentMethod", "photoConsent", "signatureName", "consentAccepted", "heardAboutUs", "referralCode", "organizationSlug", "programSlug", "termId", "participantIsAdult", "mode", "utmSource", "utmMedium", "utmCampaign", "referrerHost", "viaPortpass"]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const read = await readJson(request, Body);
    if (!read.ok) return read.response;
    body = read.value;
  } catch {
    return refuse("Invalid request.");
  }

  const typedEmail = clean(body, "parentEmail").toLowerCase();
  if (perAddress(clientIp(request)) || (typedEmail && perEmail(typedEmail))) {
    return refuse("That's a lot of registrations in a short time. Wait a few minutes and try again.", 429);
  }

  const slug = clean(body, "organizationSlug");
  // Futprep registers through its own form and endpoint.
  if (slug === "futprep") return refuse("Choose a valid class.");
  const business = await getRegistrationBusiness(slug).catch(() => null);
  if (!business) return refuse("This business isn't taking registrations on PortPass right now.", 404);

  const programSlug = clean(body, "programSlug");
  const audience = programSlug ? await getProgramAudience(business.id, programSlug).catch(() => null) : null;
  if (!audience) return refuse("Choose a valid class.");
  const adult = isAdultRegistration(audience, body.participantIsAdult === true);

  const mode = body.mode === "waitlist" ? "waitlist" : "standard";
  const paymentFrequency = clean(body, "paymentFrequency") || (mode === "waitlist" ? "weekly" : "");
  // A business that hasn't chosen cash or bank transfer sends a payment
  // request afterwards; a waitlist entry owes nothing yet.
  const typedMethod = clean(body, "paymentMethod");
  const paymentMethod = mode === "waitlist" || business.methods.length === 0 ? (business.methods[0] ?? null) : typedMethod;

  const required = adult
    ? ["parentName", "parentEmail", "parentPhone", "photoConsent", "signatureName"]
    : ["parentName", "parentEmail", "parentPhone", "relationship", "childName", "childDob", "gender", "emergencyContactName", "emergencyContactPhone", "authorizedPickup", "photoConsent", "signatureName"];
  if (required.some((field) => !clean(body, field))) return refuse("Please complete all required fields.");

  const parentEmail = clean(body, "parentEmail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) return refuse("Please enter a valid email address.");
  if (!adult && !/^\d{4}-\d{2}-\d{2}$/.test(clean(body, "childDob"))) return refuse("Enter the child's date of birth.");
  if (!["weekly", "term"].includes(paymentFrequency)) return refuse("Choose a payment plan.");
  if (mode === "standard" && business.methods.length > 0 && !business.methods.some((method) => method === paymentMethod)) return refuse("Choose how you'll pay.");
  const photoConsent = clean(body, "photoConsent");
  if (!["yes", "no"].includes(photoConsent)) return refuse("Please choose a photo/video permission option.");
  if (body.consentAccepted !== true) return refuse(adult ? "Your consent is required to register." : "Parent/guardian consent is required to register.");
  const heardAboutUs = clean(body, "heardAboutUs");
  if (!isHeardAnswer(heardAboutUs)) return refuse(`Tell us how you heard about ${business.name}.`);

  const parentName = clean(body, "parentName");
  const input: FutprepRegistrationInput = {
    parentName,
    parentEmail,
    parentPhone: phone(body, "parentPhone"),
    relationship: adult ? "Self" : clean(body, "relationship"),
    // An adult is their own participant; nothing else about them is taken.
    childName: adult ? parentName : clean(body, "childName"),
    childDob: adult ? "" : clean(body, "childDob"),
    gender: adult ? "" : clean(body, "gender"),
    emergencyContactName: adult ? "" : clean(body, "emergencyContactName"),
    emergencyContactPhone: adult ? "" : phone(body, "emergencyContactPhone"),
    allergies: adult ? "" : clean(body, "allergies"),
    medicalConditions: adult ? "" : clean(body, "medicalConditions"),
    medications: adult ? "" : clean(body, "medications"),
    specialNeeds: adult ? "" : clean(body, "specialNeeds"),
    authorizedPickup: adult ? "" : clean(body, "authorizedPickup"),
    additionalNotes: clean(body, "additionalNotes"),
    programSlug,
    participantIsAdult: adult,
    termId: Number.isInteger(Number(body.termId)) && Number(body.termId) > 0 ? Number(body.termId) : null,
    paymentFrequency: paymentFrequency as FutprepRegistrationInput["paymentFrequency"],
    paymentMethod: paymentMethod as FutprepRegistrationInput["paymentMethod"],
    photoConsent: photoConsent as FutprepRegistrationInput["photoConsent"],
    consentAccepted: true,
    signatureName: clean(body, "signatureName"),
    heardAboutUs,
    referralCode: clean(body, "referralCode") || null,
    mode,
    attribution: {
      utmSource: clean(body, "utmSource") || null,
      utmMedium: clean(body, "utmMedium") || null,
      utmCampaign: clean(body, "utmCampaign") || null,
      referrerHost: cleanHost(clean(body, "referrerHost")),
      viaPortpass: body.viaPortpass === true,
    },
  };

  try {
    const registration = await createFutprepRegistration(input, {
      organizationId: business.id,
      referencePrefix: GENERIC_REFERENCE_PREFIX,
      consentVersion: adult ? CONSENT_VERSION_ADULT : CONSENT_VERSION_CHILD,
    });
    const origin = new URL(request.url).origin;
    // A real place gets its email; a waitlist entry is confirmed on screen.
    if (registration.registrationStatus === "pending") {
      afterResponse(() =>
        sendRegistrationReceivedEmail({
          organizationId: business.id,
          business: { name: business.name, brandColor: business.brandColor, theme: business.theme },
          to: input.parentEmail,
          registrantName: input.parentName,
          childFirstName: adult ? null : input.childName.split(/\s+/)[0] ?? null,
          what: `${registration.program.name} · ${registration.term.name}`,
          when: registration.program.programType === "camp" ? `${registration.term.startDate} to ${registration.term.endDate}` : `${registration.program.day} · ${registration.program.time}–${registration.program.endTime}`,
          location: registration.term.location,
          amountDueCents: registration.amountDueCents,
          referenceCode: registration.referenceCode,
          accountUrl: `${origin}/account`,
        }),
      );
    }
    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PROGRAM" || message === "PROGRAM_NOT_AVAILABLE") return refuse("Choose a valid class.");
    if (message === "AGE_MISMATCH") return refuse("The child’s age does not match the selected class.");
    if (message === "TERM_CLOSED") return refuse(`Registration for that session has closed. Message ${business.name} if you still need a spot.`, 409);
    if (message === "SPOT_OPEN") return refuse("Good news: a spot has just opened in this class. Reload the page to register for it.", 409);
    if (message === "PROGRAM_FULL") return refuse("That class has reached capacity.", 409);
    // The existing code is not returned: anyone who knows an email and a
    // name could otherwise collect it here.
    if (message.startsWith("DUPLICATE:")) return refuse("A registration for this person has already been received for this session. The reference is in the email we sent when it was made.", 409);
    console.error("registration error", message.slice(0, 80));
    return refuse("We couldn’t complete the registration. Please try again.", 500);
  }
}
