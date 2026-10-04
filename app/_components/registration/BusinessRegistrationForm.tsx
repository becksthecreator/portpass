"use client";

import { FormEvent, useMemo, useState } from "react";
import { ShareOnWhatsApp } from "@/app/_components/blocks/WhatsAppActions";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { InstallPrompt } from "@/app/_components/InstallPrompt";
import { PhoneInput } from "@/app/_components/PhoneInput";
import type { FutprepAvailability } from "@/db/registrations";
import { track } from "@/lib/analytics";
import { EMPTY_ATTRIBUTION, HEARD_OPTIONS, type Attribution } from "@/lib/attribution";
import { ageInMonths, ageRangeMonths } from "@/lib/futprepClasses";
import { formatDateRange, offerHeadline } from "@/lib/futprepTerms";
import { consentText, isAdultRegistration, registrationSteps, STEP_LABEL, type RegistrationPaymentMethod, type RegistrationStep } from "@/lib/registrations/business";

// Registration for any business (brief 18, part D): the same steps, the
// same rules and the same table as Futprep's form, for a business's own
// programmes, terms and camps, in that business's colours (the page sets
// them). Futprep keeps its own form untouched.
//
// The class is chosen first, because who a programme is for decides what
// is asked next: a children's programme asks for the guardian, the child,
// an emergency contact and health details; an adults' programme asks for
// none of them.

type Offer = FutprepAvailability;
const offerKey = (offer: Pick<Offer, "programId" | "termId">) => `${offer.programId}:${offer.termId}`;
const timeRange = (offer: Pick<Offer, "time" | "endTime">) => (offer.endTime && offer.endTime !== offer.time ? `${offer.time}–${offer.endTime}` : offer.time);

function scheduleLine(offer: Offer): string {
  if (offer.programType === "camp") return `${formatDateRange(offer.termStartDate, offer.termEndDate)} · ${offer.dailyStartTime || offer.time}–${offer.dailyEndTime || offer.endTime}`;
  return `${offer.day}s ${timeRange(offer)} · ${offer.termName}`;
}

const METHOD_LABEL: Record<RegistrationPaymentMethod, string> = { cash: "Cash", bank_transfer: "Bank transfer" };

export type FormBusiness = {
  slug: string;
  name: string;
  // The business's page, for "Back" and for sharing.
  pageHref: string;
  methods: RegistrationPaymentMethod[];
  bank: { bankName: string; accountName: string; last4: string | null } | null;
};

type FormState = {
  parentName: string; parentEmail: string; parentPhone: string; relationship: string;
  childName: string; childDob: string; gender: string; authorizedPickup: string;
  emergencyContactName: string; emergencyContactPhone: string;
  allergies: string; medicalConditions: string; medications: string; specialNeeds: string; additionalNotes: string;
  offerKey: string; participant: "" | "adult" | "child"; paymentFrequency: string; paymentMethod: string;
  photoConsent: string; signatureName: string; consentAccepted: boolean;
  heardAboutUs: string; referralCode: string;
};

const initial: FormState = {
  parentName: "", parentEmail: "", parentPhone: "", relationship: "",
  childName: "", childDob: "", gender: "", authorizedPickup: "",
  emergencyContactName: "", emergencyContactPhone: "",
  allergies: "", medicalConditions: "", medications: "", specialNeeds: "", additionalNotes: "",
  offerKey: "", participant: "", paymentFrequency: "", paymentMethod: "",
  photoConsent: "", signatureName: "", consentAccepted: false,
  heardAboutUs: "", referralCode: "",
};

type Result = {
  referenceCode: string;
  registrationStatus?: "pending" | "waitlist" | "trial";
  program: { name: string; programType: "term" | "camp"; day: string; time: string; endTime: string };
  term: { name: string; startDate: string; endDate: string; location: string };
  paymentFrequency: "weekly" | "term";
  amountDueCents: number;
};

export function BusinessRegistrationForm({ business, offers, initialOfferKey = null, attribution = EMPTY_ATTRIBUTION }: { business: FormBusiness; offers: Offer[]; initialOfferKey?: string | null; attribution?: Attribution }) {
  const [form, setForm] = useState<FormState>(() => {
    const chosen = offers.find((offer) => offerKey(offer) === initialOfferKey) ?? (offers.length === 1 ? offers[0] : undefined);
    return {
      ...initial,
      offerKey: chosen ? offerKey(chosen) : "",
      paymentFrequency: chosen?.programType === "camp" ? "term" : "",
      paymentMethod: business.methods.length === 1 ? business.methods[0] : "",
    };
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const selected = useMemo(() => offers.find((offer) => offerKey(offer) === form.offerKey), [offers, form.offerKey]);
  const audience = selected?.audience ?? "children";
  const adult = isAdultRegistration(audience, form.participant === "adult");
  const steps = registrationSteps(adult);
  const step: RegistrationStep = steps[Math.min(stepIndex, steps.length - 1)];
  const label = (id: RegistrationStep) => (adult ? STEP_LABEL[id].adult : STEP_LABEL[id].child);
  const isCamp = selected?.programType === "camp";
  const isWaitlist = selected !== undefined && selected.spotsRemaining === 0;
  // A term with no weekly fee is paid for the term.
  const weeklyOffered = Boolean(selected && !isCamp && selected.weeklyFeeCents > 0);
  const frequency = isCamp || !weeklyOffered ? "term" : form.paymentFrequency;
  const price = !selected || isWaitlist ? null : frequency === "term" ? selected.termFeeCents : frequency === "weekly" ? selected.weeklyFeeCents : null;
  const participantName = adult ? form.parentName : form.childName;
  const firstName = participantName.trim().split(/\s+/)[0] ?? "";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function chooseOffer(offer: Offer) {
    setForm((current) => ({ ...current, offerKey: offerKey(offer), participant: offer.audience === "mixed" ? current.participant : "", paymentFrequency: offer.programType === "camp" ? "term" : current.paymentFrequency }));
    setError("");
  }

  function validate(): string {
    if (step === "class") {
      if (!selected) return "Choose a class or camp.";
      if (audience === "mixed" && !form.participant) return "Tell us who this registration is for.";
      if (!isWaitlist && !isCamp && weeklyOffered && !form.paymentFrequency) return "Choose a payment plan.";
      if (!isWaitlist && business.methods.length > 0 && !form.paymentMethod) return "Choose how you'll pay.";
    }
    if (step === "you") {
      if (!form.parentName || !form.parentEmail || !form.parentPhone || (!adult && !form.relationship)) return adult ? "Complete your details." : "Complete all parent/guardian details.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parentEmail)) return "Enter a valid email address.";
      if (!form.heardAboutUs) return `Tell us how you heard about ${business.name}.`;
    }
    if (step === "child") {
      if (!form.childName || !form.childDob || !form.gender || !form.authorizedPickup) return "Complete the child and pickup details.";
      if (selected) {
        const months = ageInMonths(form.childDob, selected.termStartDate);
        const range = ageRangeMonths(selected);
        if (months < 0 || months < range.min || months > range.max) return `${selected.name} is for ages ${selected.ageLabel}.`;
      }
    }
    if (step === "health" && (!form.emergencyContactName || !form.emergencyContactPhone)) return "Add an emergency contact.";
    return "";
  }

  function next() {
    const message = validate();
    if (message) return setError(message);
    // The event carries the business, never the person's details.
    if (stepIndex === 0) track("register_start", { org: business.slug });
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.photoConsent) return setError("Choose Yes or No for photo/video permission.");
    if (!form.signatureName.trim()) return setError(adult ? "Type your full name as your signature." : "Enter the parent/guardian electronic signature.");
    if (!form.consentAccepted) return setError("The consent box is required.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(adult
            ? { parentName: form.parentName, parentEmail: form.parentEmail, parentPhone: form.parentPhone, additionalNotes: form.additionalNotes }
            : form),
          photoConsent: form.photoConsent,
          signatureName: form.signatureName,
          consentAccepted: form.consentAccepted,
          heardAboutUs: form.heardAboutUs,
          referralCode: form.referralCode,
          organizationSlug: business.slug,
          programSlug: selected?.slug ?? "",
          termId: selected?.termId ?? null,
          participantIsAdult: adult,
          paymentFrequency: isWaitlist ? "" : frequency,
          paymentMethod: isWaitlist ? "" : form.paymentMethod,
          mode: isWaitlist ? "waitlist" : "standard",
          ...attribution,
        }),
      });
      const data = (await response.json()) as { registration?: Result; error?: string };
      if (!response.ok || !data.registration) throw new Error(data.error ?? "Registration failed.");
      setResult(data.registration);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t complete the registration.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const waitlist = result.registrationStatus === "waitlist";
    return (
      <section className="registration-confirmation">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow">{waitlist ? "Waitlist" : "Registration received"}</div>
        <h1>{waitlist ? `${firstName || "You"} ${adult ? "are" : "is"} on the waitlist.` : adult ? "You’re on the list." : `${firstName} is on the list.`}</h1>
        <p className="confirmation-lead">
          {waitlist
            ? `${result.program.name} · ${result.term.name} is full right now. ${business.name} will message you if a spot opens. There's nothing to pay unless you get a place.`
            : `${business.name} has received the registration for ${result.program.name} · ${result.term.name}. Payment stays pending until ${business.name} records it.`}
        </p>
        <div className="confirmation-reference"><span>{waitlist ? "Reference" : "Registration reference"}</span><strong>{result.referenceCode}</strong></div>
        <dl className="confirmation-grid">
          <div><dt>{result.program.programType === "camp" ? "Camp" : "Class"}</dt><dd>{result.program.name}</dd></div>
          <div><dt>{result.program.programType === "camp" ? "Dates" : "Time"}</dt><dd>{result.program.programType === "camp" ? `${formatDateRange(result.term.startDate, result.term.endDate)} · ${timeRange(result.program)}` : `${result.program.day} · ${timeRange(result.program)}`}</dd></div>
          <div><dt>Location</dt><dd>{result.term.location}</dd></div>
          {!waitlist && <div><dt>Amount</dt><dd>{formatPriceCents(result.amountDueCents)}{result.paymentFrequency === "weekly" && result.program.programType !== "camp" ? " per class" : ""}</dd></div>}
          <div><dt>Status</dt><dd><span className="status status-submitted">{waitlist ? "Waitlist" : "Payment pending"}</span></dd></div>
        </dl>
        {!waitlist && (
          <div className="payment-instruction">
            <strong>Pay {business.name} directly</strong>
            <p>
              {form.paymentMethod === "cash"
                ? `Pay ${business.name} in cash, in person.`
                : form.paymentMethod === "bank_transfer" && business.bank
                  ? `Transfer to ${business.bank.accountName} at ${business.bank.bankName}${business.bank.last4 ? ` (account ending ${business.bank.last4})` : ""}.`
                  : `${business.name} will tell you how to pay.`}{" "}
              {business.name} will send you a payment request with the details; quote <strong>{result.referenceCode}</strong>. PortPass never holds your money.
            </p>
          </div>
        )}
        <p className="confirmation-share"><ShareOnWhatsApp url={`https://portpassbahamas.com${business.pageHref}`} text={`${adult ? "I’m" : `${firstName} is`} registered with ${business.name} on PortPass:`} org={business.slug} /></p>
        <a className="secondary-button" href={business.pageHref}>Back to {business.name}</a>
        <div className="confirmation-save">
          <p><strong>Save this to a free PortPass account</strong>Keep {adult ? "your" : `${firstName}’s`} registration and payments in one place.</p>
          <a className="secondary-button" href={`/signup?as=customer&email=${encodeURIComponent(form.parentEmail.trim())}&name=${encodeURIComponent(form.parentName.trim())}&next=${encodeURIComponent("/account")}`}>Save to an account →</a>
        </div>
        <InstallPrompt heading="Keep PortPass on your phone" lead="Add it to your home screen to check this registration and its payment in one tap. Nothing to download from a store." />
      </section>
    );
  }

  const number = String(stepIndex + 1).padStart(2, "0");

  return (
    <section className="registration-shell">
      <div className="registration-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />{business.name} · {selected ? `${selected.termName} registration` : "Registration"}</div>
          <h1>{adult ? "Register." : "Register your child."}</h1>
          {selected ? (
            <p>Registering for <strong>{offerHeadline(selected)}</strong>.{isCamp ? ` Camp fee ${formatPriceCents(selected.termFeeCents)}.` : ""} You pay {business.name} directly.</p>
          ) : (
            <p>Choose a class or camp to start. There&apos;s no registration fee, and you pay {business.name} directly.</p>
          )}
        </div>
        <div className="registration-progress" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((id, index) => (
            <div className={index === stepIndex ? "is-current" : index < stepIndex ? "is-complete" : ""} key={id}>
              <span>{index < stepIndex ? "✓" : index + 1}</span><small>{label(id)}</small>
            </div>
          ))}
        </div>
      </div>

      <form className="registration-form" onSubmit={submit}>
        {step === "class" && (
          <fieldset>
            <legend><span>{number}</span>Class & payment</legend>
            <div className="choice-section">
              <span className="choice-heading">Choose a class or camp *</span>
              <div className="class-choice-grid">
                {offers.length === 0 && <p className="form-hint">Nothing is open for registration right now. Message {business.name} and they&apos;ll tell you when the next one opens.</p>}
                {offers.map((offer) => (
                  <label className={`choice-card ${form.offerKey === offerKey(offer) ? "is-selected" : ""}`} key={offerKey(offer)}>
                    <input type="radio" name="program" checked={form.offerKey === offerKey(offer)} onChange={() => chooseOffer(offer)} />
                    <span className="choice-check" />
                    {offer.programType === "camp" && <span className="coming-soon-pill">Camp</span>}
                    <strong>{offer.name}</strong>
                    <span>{offer.audience === "adults" ? "Adults" : `Ages ${offer.ageLabel}`} · {scheduleLine(offer)}</span>
                    {offer.locationNote && <small>{offer.locationNote}</small>}
                    <small>{offer.spotsRemaining === 0 ? "Full · join the waitlist" : `${offer.spotsRemaining} of ${offer.capacity} spots remaining`}{offer.programType === "camp" ? ` · ${formatPriceCents(offer.termFeeCents)}` : ""}</small>
                  </label>
                ))}
              </div>
            </div>

            {selected && audience === "mixed" && (
              <div className="choice-section">
                <span className="choice-heading">Who is this for? *</span>
                <div className="payment-method-grid">
                  <label className={`choice-card ${form.participant === "adult" ? "is-selected" : ""}`}>
                    <input type="radio" name="participant" checked={form.participant === "adult"} onChange={() => set("participant", "adult")} />
                    <span className="choice-check" /><strong>Me</strong><span>I&apos;m 18 or older and registering myself.</span>
                  </label>
                  <label className={`choice-card ${form.participant === "child" ? "is-selected" : ""}`}>
                    <input type="radio" name="participant" checked={form.participant === "child"} onChange={() => set("participant", "child")} />
                    <span className="choice-check" /><strong>A child</strong><span>I&apos;m the parent or guardian.</span>
                  </label>
                </div>
              </div>
            )}

            {isWaitlist && selected && (
              <div className="registration-total registration-waitlist"><span>{selected.name} is full. Join the waitlist and {business.name} will message you if a spot opens. Nothing to pay now.</span><strong>Waitlist</strong></div>
            )}

            {isCamp && !isWaitlist && selected && (
              <div className="registration-total"><span>Camp fee ({formatDateRange(selected.termStartDate, selected.termEndDate)})</span><strong>{formatPriceCents(selected.termFeeCents)}</strong></div>
            )}

            {selected && !isCamp && !isWaitlist && weeklyOffered && (
              <div className="choice-section">
                <span className="choice-heading">Payment plan *</span>
                <div className="payment-method-grid">
                  <label className={`choice-card ${form.paymentFrequency === "weekly" ? "is-selected" : ""}`}>
                    <input type="radio" name="frequency" checked={form.paymentFrequency === "weekly"} onChange={() => set("paymentFrequency", "weekly")} />
                    <span className="choice-check" /><strong>Pay weekly</strong><span>{formatPriceCents(selected.weeklyFeeCents)} per class</span>
                  </label>
                  <label className={`choice-card ${form.paymentFrequency === "term" ? "is-selected" : ""}`}>
                    <input type="radio" name="frequency" checked={form.paymentFrequency === "term"} onChange={() => set("paymentFrequency", "term")} />
                    <span className="choice-check" /><strong>Pay full term</strong><span>{formatPriceCents(selected.termFeeCents)} for {selected.termName}</span>
                  </label>
                </div>
              </div>
            )}

            {selected && !isWaitlist && (
              <div className="choice-section">
                <span className="choice-heading">{business.methods.length > 0 ? "Payment method *" : "Payment"}</span>
                {business.methods.length > 0 ? (
                  <div className="payment-method-grid">
                    {business.methods.map((method) => (
                      <label className={`choice-card ${form.paymentMethod === method ? "is-selected" : ""}`} key={method}>
                        <input type="radio" name="method" checked={form.paymentMethod === method} onChange={() => set("paymentMethod", method)} />
                        <span className="choice-check" /><strong>{METHOD_LABEL[method]}</strong>
                        <span>{method === "cash" ? `Pay ${business.name} in person.` : "Transfer from your bank or its app."}</span>
                      </label>
                    ))}
                    <div className="choice-card is-disabled"><span className="coming-soon-pill">Coming soon</span><strong>Online card payment</strong><span>Not available yet.</span></div>
                  </div>
                ) : (
                  <p className="form-hint">You pay {business.name} directly. They&apos;ll send you a payment request after you register.</p>
                )}
              </div>
            )}

            {selected && !isWaitlist && form.paymentMethod === "bank_transfer" && business.bank && (
              <div className="bank-panel">
                <div>
                  <span className="choice-heading">Bank transfer to {business.name}</span>
                  <p>You&apos;ll get a registration reference after you submit, and {business.name} will send a payment request with the full transfer details. Quote the reference so they can match your payment.</p>
                </div>
                <dl className="bank-details">
                  <div><dt>Bank</dt><dd>{business.bank.bankName}</dd></div>
                  <div><dt>Account name</dt><dd>{business.bank.accountName}</dd></div>
                  {business.bank.last4 && <div><dt>Account</dt><dd>Ending {business.bank.last4}</dd></div>}
                </dl>
              </div>
            )}

            {price !== null && !isCamp && <div className="registration-total"><span>{frequency === "term" ? `${selected?.termName ?? "Term"} amount` : "Weekly class amount"}</span><strong>{formatPriceCents(price)}</strong></div>}
          </fieldset>
        )}

        {step === "you" && (
          <fieldset>
            <legend><span>{number}</span>{adult ? "Your details" : "Parent / guardian"}</legend>
            <div className="form-grid">
              <label><span>Full name *</span><input autoComplete="name" value={form.parentName} onChange={(e) => set("parentName", e.target.value)} /></label>
              {!adult && <label><span>Relationship *</span><input value={form.relationship} onChange={(e) => set("relationship", e.target.value)} placeholder="Mother, father, guardian…" /></label>}
              <label><span>Email *</span><input type="email" autoComplete="email" value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} /></label>
              <label><span>Phone *</span><PhoneInput required value={form.parentPhone} onChange={(v) => set("parentPhone", v)} /></label>
              <label className="full-field">
                <span>How did you hear about {business.name}? *</span>
                <select value={form.heardAboutUs} onChange={(e) => set("heardAboutUs", e.target.value)}>
                  <option value="">Choose one</option>
                  {HEARD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {form.heardAboutUs === "referral" && (
                <label className="full-field"><span>Their name or referral code (optional)</span><input value={form.referralCode} maxLength={40} onChange={(e) => set("referralCode", e.target.value)} /></label>
              )}
              {adult && <label className="full-field"><span>Anything {business.name} should know? (optional)</span><textarea rows={3} value={form.additionalNotes} onChange={(e) => set("additionalNotes", e.target.value)} /></label>}
            </div>
          </fieldset>
        )}

        {step === "child" && (
          <fieldset>
            <legend><span>{number}</span>Child</legend>
            <div className="form-grid">
              <label><span>Child full name *</span><input value={form.childName} onChange={(e) => set("childName", e.target.value)} /></label>
              <label><span>Date of birth *</span><input type="date" value={form.childDob} onChange={(e) => set("childDob", e.target.value)} /></label>
              <label><span>Gender *</span><select value={form.gender} onChange={(e) => set("gender", e.target.value)}><option value="">Choose</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label>
              <label className="full-field"><span>Authorized pickup person(s) *</span><textarea rows={3} value={form.authorizedPickup} onChange={(e) => set("authorizedPickup", e.target.value)} placeholder="Names and relationship to child" /></label>
            </div>
          </fieldset>
        )}

        {step === "health" && (
          <fieldset>
            <legend><span>{number}</span>Health & safety</legend>
            <div className="form-grid">
              <label><span>Emergency contact name *</span><input value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} /></label>
              <label><span>Emergency contact phone *</span><PhoneInput required value={form.emergencyContactPhone} onChange={(v) => set("emergencyContactPhone", v)} /></label>
              <label className="full-field"><span>Allergies</span><textarea rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Write none if there are no known allergies" /></label>
              <label className="full-field"><span>Medical conditions</span><textarea rows={2} value={form.medicalConditions} onChange={(e) => set("medicalConditions", e.target.value)} /></label>
              <label className="full-field"><span>Medications</span><textarea rows={2} value={form.medications} onChange={(e) => set("medications", e.target.value)} /></label>
              <label className="full-field"><span>Disabilities, developmental needs or special accommodations</span><textarea rows={3} value={form.specialNeeds} onChange={(e) => set("specialNeeds", e.target.value)} /></label>
              <label className="full-field"><span>Additional notes</span><textarea rows={3} value={form.additionalNotes} onChange={(e) => set("additionalNotes", e.target.value)} /></label>
            </div>
          </fieldset>
        )}

        {step === "consent" && (
          <fieldset>
            <legend><span>{number}</span>Review & consent</legend>
            <div className="registration-review">
              <div><span>{adult ? "Participant" : "Child"}</span><strong>{participantName}</strong><small>{adult ? "" : form.childDob}</small></div>
              <div><span>{isCamp ? "Camp" : "Class"}</span><strong>{selected?.name}</strong><small>{selected ? scheduleLine(selected) : ""}</small></div>
              {isWaitlist ? (
                <div><span>Waitlist</span><strong>Class full</strong><small>Nothing to pay now</small></div>
              ) : (
                <div><span>Payment</span><strong>{isCamp ? "Camp fee" : frequency === "term" ? "Full term" : "Weekly"} · {price !== null ? formatPriceCents(price) : ""}</strong><small>{form.paymentMethod ? METHOD_LABEL[form.paymentMethod as RegistrationPaymentMethod] ?? "" : `Paid to ${business.name} directly`}</small></div>
              )}
              <div><span>{adult ? "Contact" : "Parent/guardian"}</span><strong>{form.parentName}</strong><small>{form.parentEmail}</small></div>
            </div>

            <div className="photo-consent">
              <span className="choice-heading">Photo & video permission *</span>
              <p>{business.name} may take photographs or video during sessions for promotional use.</p>
              <div className="inline-choice">
                <label><input type="radio" name="photo" checked={form.photoConsent === "yes"} onChange={() => set("photoConsent", "yes")} /> Yes, I give permission</label>
                <label><input type="radio" name="photo" checked={form.photoConsent === "no"} onChange={() => set("photoConsent", "no")} /> No, I do not give permission</label>
              </div>
            </div>

            <div className="single-consent">
              <label>
                <input type="checkbox" checked={form.consentAccepted} onChange={(e) => set("consentAccepted", e.target.checked)} />
                <span>{consentText(business.name, adult)}</span>
              </label>
            </div>

            <label className="signature-field">
              <span>{adult ? "Your electronic signature *" : "Parent/guardian electronic signature *"}</span>
              <input value={form.signatureName} onChange={(e) => set("signatureName", e.target.value)} placeholder="Type your full name" />
              <small>Typing your name confirms the consent above. The consent version and submission time are recorded automatically. How this information is used and how long it is kept: <a href={adult ? "/privacy" : "/privacy#children"} target="_blank" rel="noopener">Privacy Policy</a>.</small>
            </label>
          </fieldset>
        )}

        {error && <p className="form-error registration-error" role="alert">{error}</p>}

        <div className="registration-actions">
          {stepIndex > 0 ? <button className="secondary-button" type="button" onClick={() => setStepIndex((s) => s - 1)} disabled={busy}>← Back</button> : <a className="secondary-button" href={business.pageHref}>← {business.name}</a>}
          {stepIndex < steps.length - 1
            ? <button className="primary-button" type="button" onClick={next}>Continue →</button>
            : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : isWaitlist ? "Join the waitlist →" : "Submit registration →"}</button>}
        </div>
      </form>
    </section>
  );
}
