// Registration for any business (brief 18, part D): the wording and small
// rules shared by the page, the form, the API and the email. Pure: no
// server imports, so the form (client) and the tests can use it.
import type { ProgramAudience } from "@/db/registrations";

// Reference codes for every business but Futprep ("FP-") start "PP-": the
// format a parent types is two letters, a year and eight characters
// (lib/referenceCode.ts).
export const GENERIC_REFERENCE_PREFIX = "PP";

// The consent a registration was given under. A new wording gets a new
// version here; the version is stored with each registration.
export const CONSENT_VERSION_CHILD = "portpass-registration-child-v1";
export const CONSENT_VERSION_ADULT = "portpass-registration-adult-v1";

// What the person ticks. A child's registration is signed by the parent or
// guardian and covers first aid and the use of the health details given;
// an adult's covers themselves, and asks for no health details at all.
export function consentText(businessName: string, adult: boolean): string {
  return adult
    ? `I confirm that I am 18 or older and that the information I have given is accurate. I understand and accept the normal risks of taking part in physical activity. I consent to ${businessName} and authorized PortPass users securely using this information to manage my registration, communication and payments.`
    : `I confirm that I am the parent/legal guardian or am authorized to register this child. I confirm that the information provided is accurate and complete. I understand and accept the normal risks of taking part in these activities. I authorize ${businessName} staff to take reasonable action, including first aid and contacting emergency medical services, if necessary for my child's health or safety. I consent to ${businessName} and authorized PortPass users securely using the registration and health information provided to manage registration, attendance, communication, payments and participant safety.`;
}

// Whether this registration is an adult's own: always on an adults'
// programme, never on a children's one, and the registrant's answer on a
// mixed one.
export function isAdultRegistration(audience: ProgramAudience, saysAdult: boolean): boolean {
  return audience === "adults" || (audience === "mixed" && saysAdult);
}

// The steps the form shows, in order. The class comes first, because who
// the programme is for decides which questions follow; an adult is never
// shown the child or health steps.
export type RegistrationStep = "class" | "you" | "child" | "health" | "consent";

export function registrationSteps(adult: boolean): RegistrationStep[] {
  return adult ? ["class", "you", "consent"] : ["class", "you", "child", "health", "consent"];
}

export const STEP_LABEL: Record<RegistrationStep, { adult: string; child: string }> = {
  class: { adult: "Class & payment", child: "Class & payment" },
  you: { adult: "Your details", child: "Parent" },
  child: { adult: "", child: "Child" },
  health: { adult: "", child: "Health & safety" },
  consent: { adult: "Consent", child: "Consent" },
};

// The payment methods a registration form may offer: what the business
// chose in its Get paid step, of the two a registration can record.
export type RegistrationPaymentMethod = "cash" | "bank_transfer";

export function registrationMethods(accepted: readonly string[]): RegistrationPaymentMethod[] {
  return (["bank_transfer", "cash"] as const).filter((method) => accepted.includes(method));
}
