"use client";

import { ShareOnWhatsApp } from "@/app/_components/blocks/WhatsAppActions";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { InstallPrompt } from "@/app/_components/InstallPrompt";
import { recordGrowthEvent } from "@/app/_components/GrowthBeacon";
import { track } from "@/lib/analytics";
import { EMPTY_ATTRIBUTION, HEARD_OPTIONS, type Attribution } from "@/lib/attribution";

import type { FutprepAvailability, TrialSession } from "@/db/registrations";
import { formatDateRange, offerHeadline } from "@/lib/futprepTerms";
import { ageInMonths, ageRangeMonths } from "@/lib/futprepClasses";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FUTPREP_BANK_DETAILS,
  normalizeProgramSlug,
  programTimeRange,
} from "../config";

// One registrable program-in-a-term (a class in Term 1, the October camp):
// what the page loaded from the database. Nothing in this form names a
// term or a program itself (brief 06 v2, A1.5).
type Offer = FutprepAvailability;
const offerKey = (offer: Pick<Offer, "programId" | "termId">) => `${offer.programId}:${offer.termId}`;

function scheduleLine(offer: Offer): string {
  if (offer.programType === "camp") {
    return `${formatDateRange(offer.termStartDate, offer.termEndDate)} · ${offer.dailyStartTime || offer.time}–${offer.dailyEndTime || offer.endTime}`;
  }
  return `${offer.day}s ${programTimeRange(offer)} · ${offer.termName}`;
}

function paymentMethodLabel(method: string) {
  if (method === "cash") return "Cash";
  if (method === "online_banking") return "Online banking transfer";
  if (method === "bank_transfer") return "Bank transfer";
  return "";
}

type FormState = {
  parentName: string; parentEmail: string; parentPhone: string; relationship: string;
  childName: string; childDob: string; gender: string; authorizedPickup: string;
  emergencyContactName: string; emergencyContactPhone: string;
  allergies: string; medicalConditions: string; medications: string; specialNeeds: string; additionalNotes: string;
  offerKey: string; paymentFrequency: string; paymentMethod: string;
  photoConsent: string; signatureName: string; consentAccepted: boolean;
  heardAboutUs: string; referralCode: string;
};

type RegistrationResult = {
  referenceCode: string;
  registrationStatus?: "pending" | "waitlist" | "trial";
  program: { name: string; programType: "term" | "camp"; day: string; time: string; endTime: string };
  term: { name: string; startDate: string; endDate: string; location: string };
  paymentFrequency: "weekly" | "term";
  amountDueCents: number;
};

const initial: FormState = {
  parentName:"", parentEmail:"", parentPhone:"", relationship:"",
  childName:"", childDob:"", gender:"", authorizedPickup:"",
  emergencyContactName:"", emergencyContactPhone:"",
  allergies:"", medicalConditions:"", medications:"", specialNeeds:"", additionalNotes:"",
  offerKey:"", paymentFrequency:"", paymentMethod:"",
  photoConsent:"", signatureName:"", consentAccepted:false,
  heardAboutUs:"", referralCode:"",
};

const STANDARD_STEPS = ["Parent","Child","Health & safety","Class & payment","Consent"];
const TRIAL_STEPS = ["Parent","Child","Health & safety","Class & Saturday","Consent"];

// Part C (brief 06 v2) extras, all optional: a returning family's
// early-access link (prefill without medical fields), the free first
// Saturday for signed-in parents, and "join the rest of the term" after a
// trial at the price for the Saturdays left.
export type JoinQuote = { code: string; offerKey: string; remainingSessions: number; amountCents: number; weeklyFeeCents: number; childName: string };
export type FormPrefill = Partial<Pick<FormState,
  "parentName" | "parentEmail" | "parentPhone" | "relationship" | "childName" | "childDob" | "gender" |
  "emergencyContactName" | "emergencyContactPhone" | "authorizedPickup">>;
export type RegistrationIntro = { eyebrow: string; title: string; lead: string };

function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

// `attribution` is what the page read from the 30-day first-party cookie
// and this request's URL (growth-tracking brief, 28 Sept). It travels with
// the submission as hidden values; the server decides what it proves.
//
// `offers` come from the page (every public open program-in-a-term, plus
// the one a direct link names); `initialOfferKey` is that link's choice.
export function RegistrationForm({
  attribution = EMPTY_ATTRIBUTION, offers, initialOfferKey = null,
  mode = "standard", prefill = null, returnToken = null, trialSessions = {}, joinQuote = null, intro = null, trialHref = null, trialLabel = null, closedNotice = null,
}: {
  attribution?: Attribution; offers: Offer[]; initialOfferKey?: string | null;
  mode?: "standard" | "trial"; prefill?: FormPrefill | null; returnToken?: string | null;
  trialSessions?: Record<string, TrialSession[]>; joinQuote?: JoinQuote | null; intro?: RegistrationIntro | null;
  trialHref?: string | null;
  // Brief 12: "Free taster Saturday, 12 Dec →", from the taster date.
  trialLabel?: string | null;
  // Brief 27 (A): what to say when nothing is open, e.g. "Term 2 opens on
  // Thursday 19 November." Without it, the generic line.
  closedNotice?: string | null;
}) {
  const searchParams = useSearchParams();
  const availability = offers;
  const isTrial = mode === "trial";
  const growthStarted = useRef(false);
  const steps = isTrial ? TRIAL_STEPS : STANDARD_STEPS;
  const [trialSessionId, setTrialSessionId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => {
    // An old link carries only ?program=<slug>: it preselects when that
    // program has exactly one open term.
    const legacySlug = normalizeProgramSlug(searchParams.get("program") ?? "");
    const bySlug = legacySlug ? offers.filter((offer) => offer.slug === legacySlug) : [];
    const preselected = initialOfferKey ?? (bySlug.length === 1 ? offerKey(bySlug[0]) : "");
    const preselectedOffer = offers.find((offer) => offerKey(offer) === preselected);
    return {
      ...initial,
      offerKey: preselected,
      paymentFrequency: preselectedOffer?.programType === "camp" ? "term" : "",
      parentName: searchParams.get("parentName") ?? "",
      parentEmail: searchParams.get("parentEmail") ?? "",
      parentPhone: searchParams.get("parentPhone") ?? "",
      relationship: searchParams.get("relationship") ?? "",
      // A return link fills in everything it can -- never the medical,
      // allergy or medication fields.
      ...(prefill ?? {}),
    };
  });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const selectedProgram = useMemo(
    () => availability.find((offer) => offerKey(offer) === form.offerKey),
    [availability, form.offerKey],
  );
  const isCamp = selectedProgram?.programType === "camp";
  // A full class takes waitlist entries instead (Part C); nothing to pay.
  const isWaitlist = !isTrial && selectedProgram !== undefined && selectedProgram.spotsRemaining === 0;
  const joinApplies = !isTrial && !isWaitlist && joinQuote !== null && joinQuote.offerKey === form.offerKey;
  const saturdays = selectedProgram ? trialSessions[offerKey(selectedProgram)] ?? [] : [];
  const chosenSaturday = saturdays.find((s) => s.sessionId === trialSessionId) ?? null;
  // Camps are paid in full: the camp fee, no weekly/term choice.
  const selectedPrice = isTrial || isWaitlist
    ? null
    : joinApplies && joinQuote
      ? joinQuote.amountCents
      : selectedProgram
    ? isCamp
      ? selectedProgram.termFeeCents
      : form.paymentFrequency
        ? (form.paymentFrequency === "term" ? selectedProgram.termFeeCents : selectedProgram.weeklyFeeCents)
        : null
    : null;

  // Brief 12: ages are checked in months (Lil Kickers from 18 months).
  const overallAgeRange = useMemo(() => {
    const pool = selectedProgram ? [selectedProgram] : availability;
    if (!pool.length) return { min: 0, max: 99 * 12 };
    const ranges = pool.map((program) => ageRangeMonths(program));
    return { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) };
  }, [availability, selectedProgram]);
  const ageLabels = useMemo(() => Array.from(new Set(availability.map((program) => program.ageLabel))), [availability]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function chooseOffer(offer: Offer) {
    setTrialSessionId(null);
    setForm((current) => ({
      ...current,
      offerKey: offerKey(offer),
      paymentFrequency: offer.programType === "camp" ? "term" : current.paymentFrequency,
    }));
    setError("");
  }

  function validate() {
    if (step === 0) {
      if (!form.parentName || !form.parentEmail || !form.parentPhone || !form.relationship) return "Complete all parent/guardian details.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parentEmail)) return "Enter a valid email address.";
      if (!form.heardAboutUs) return "Tell us how you heard about Futprep.";
    }
    if (step === 1) {
      if (!form.childName || !form.childDob || !form.gender || !form.authorizedPickup) return "Complete the child and pickup details.";
      const referenceDate = selectedProgram?.termStartDate ?? availability[0]?.termStartDate ?? new Date().toISOString().slice(0, 10);
      const months = ageInMonths(form.childDob, referenceDate);
      if (months < 0 || months < overallAgeRange.min || months > overallAgeRange.max) {
        return selectedProgram ? `${selectedProgram.name} is for ages ${selectedProgram.ageLabel}.` : `Our classes and camps are for ages ${ageLabels.join(", ")}.`;
      }
    }
    if (step === 2 && (!form.emergencyContactName || !form.emergencyContactPhone)) return "Add an emergency contact.";
    if (step === 3) {
      if (!selectedProgram) return isTrial ? "Choose a class." : "Choose a class or camp.";
      if (isTrial && !chosenSaturday) return "Choose the taster Saturday.";
      if (!isTrial && !isWaitlist && !isCamp && !joinApplies && !form.paymentFrequency) return "Choose a payment plan.";
      if (!isTrial && !isWaitlist && !form.paymentMethod) return "Choose a payment method.";
      if (selectedProgram) {
        const months = ageInMonths(form.childDob, selectedProgram.termStartDate);
        const range = ageRangeMonths(selectedProgram);
        if (months >= 0 && (months < range.min || months > range.max)) return `${selectedProgram.name} is for ages ${selectedProgram.ageLabel}.`;
      }
    }
    return "";
  }

  function next() {
    const message = validate();
    if (message) return setError(message);
    // Leaving step 1 is the "started registering" signal (round 4, item 8);
    // the event carries the business, never the parent's details.
    if (step === 0) {
      track("register_start", { org: "futprep" });
      // Once per visit, and not for a free taster (a taster is not a place).
      if (!growthStarted.current && !isTrial) {
        growthStarted.current = true;
        recordGrowthEvent("register_start");
      }
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.photoConsent) return setError("Choose Yes or No for photo/video permission.");
    if (!form.signatureName.trim()) return setError("Enter the parent/guardian electronic signature.");
    if (!form.consentAccepted) return setError("The parent/guardian consent box is required.");

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/futprep/registrations", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          ...form,
          programSlug: selectedProgram?.slug ?? "",
          termId: selectedProgram?.termId ?? null,
          paymentFrequency: isTrial || isWaitlist ? "" : isCamp || joinApplies ? "term" : form.paymentFrequency,
          paymentMethod: isTrial || isWaitlist ? "" : form.paymentMethod,
          mode: isTrial ? "trial" : isWaitlist ? "waitlist" : "standard",
          returnToken,
          trialSessionId: isTrial ? chosenSaturday?.sessionId ?? null : null,
          joinFromTrialCode: joinApplies && joinQuote ? joinQuote.code : null,
          ...attribution,
        }),
      });
      const data = await response.json() as { registration?: RegistrationResult; error?: string; referenceCode?: string };
      if (!response.ok || !data.registration) throw new Error(data.error ?? (data.referenceCode ? `Registration already exists: ${data.referenceCode}` : "Registration failed."));
      setResult(data.registration);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t complete the registration.");
    } finally {
      setBusy(false);
    }
  }

  if (result && (result.registrationStatus === "waitlist" || result.registrationStatus === "trial")) {
    const trial = result.registrationStatus === "trial";
    const first = form.childName.split(" ")[0];
    return (
      <section className="registration-confirmation">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow">{trial ? "Free taster booked" : "Waitlist"}</div>
        <h1>{trial ? `${first}'s free taster Saturday is booked.` : `${first} is on the waitlist.`}</h1>
        <p className="confirmation-lead">{trial
          ? `See you at ${result.program.name}. There's nothing to pay. After the taster, Futprep will send you a link to join ${result.term.name}.`
          : `${result.program.name} · ${result.term.name} is full right now. Futprep will message you if a spot opens. There's nothing to pay unless you get a place.`}</p>
        <div className="confirmation-reference"><span>Reference</span><strong>{result.referenceCode}</strong></div>
        <dl className="confirmation-grid">
          <div><dt>Class</dt><dd>{result.program.name}</dd></div>
          <div><dt>{trial ? "Saturday" : "Time"}</dt><dd>{trial && chosenSaturday ? `${longDate(chosenSaturday.date)} · ${programTimeRange(result.program)}` : `${result.program.day} · ${programTimeRange(result.program)}`}</dd></div>
          <div><dt>Location</dt><dd>{result.term.location}</dd></div>
          <div><dt>Status</dt><dd><span className="status status-submitted">{trial ? "Free taster" : "Waitlist"}</span></dd></div>
        </dl>
        <a className="secondary-button" href={selectedProgram ? `/sports-fitness/futprep-athletics/${selectedProgram.slug}` : "/sports-fitness/futprep-athletics"}>Back to program details</a>
        <InstallPrompt heading="Keep PortPass on your phone" lead="Add it to your home screen to come back to this in one tap. Nothing to download from a store." />
      </section>
    );
  }

  if (result) {
    return (
      <section className="registration-confirmation">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow">Registration received</div>
        <h1>{form.childName} is on the list.</h1>
        <p className="confirmation-lead">Futprep has received the registration for {result.program.name} · {result.term.name}. Payment stays pending until Futprep records or confirms it.</p>
        <div className="confirmation-reference"><span>Registration reference</span><strong>{result.referenceCode}</strong></div>
        <dl className="confirmation-grid">
          <div><dt>Class</dt><dd>{result.program.name}</dd></div>
          <div><dt>{result.program.programType === "camp" ? "Dates" : "Time"}</dt><dd>{result.program.programType === "camp" ? `${formatDateRange(result.term.startDate, result.term.endDate)} · ${programTimeRange(result.program)}` : `${result.program.day} · ${programTimeRange(result.program)}`}</dd></div>
          <div><dt>Location</dt><dd>{result.term.location}</dd></div>
          <div><dt>Plan</dt><dd>{result.program.programType === "camp" ? "Camp fee" : result.paymentFrequency === "term" ? "Full term" : "Weekly"}</dd></div>
          <div><dt>Amount</dt><dd>{formatPriceCents(result.amountDueCents)}{result.paymentFrequency === "weekly" && result.program.programType !== "camp" ? " per class" : ""}</dd></div>
          <div><dt>Status</dt><dd><span className="status status-submitted">Payment pending</span></dd></div>
        </dl>
        <p className="confirmation-share"><ShareOnWhatsApp url="https://portpassbahamas.com/sports-fitness/futprep-athletics" text={`${form.childName} is registered with Futprep Athletics on PortPass:`} /></p>
        <div className="payment-instruction">
          <strong>{form.paymentMethod === "cash" ? "Cash payment" : paymentMethodLabel(form.paymentMethod)}</strong>
          {form.paymentMethod === "cash" ? (
            <p>Please give the cash payment directly to your Futprep coach in person. Futprep will update the payment status after it is received.</p>
          ) : (
            <>
              <p>{form.paymentMethod === "online_banking"
                ? "Send this from your own bank's online or mobile banking app."
                : "Visit your bank and transfer to the account below."} Use your registration code as the transfer reference — <strong>{result.referenceCode}</strong> — so Futprep can match the payment automatically.</p>
              <div className="bank-details compact">
                <span>{FUTPREP_BANK_DETAILS.bankName}</span>
                <span>{FUTPREP_BANK_DETAILS.accountName}</span>
                <span>{FUTPREP_BANK_DETAILS.accountNumber}</span>
                <span>SWIFT {FUTPREP_BANK_DETAILS.swiftCode}</span>
              </div>
            </>
          )}
        </div>
        <a className="primary-button" href={`/futprep/my/${result.referenceCode}`}>Check registration status →</a>
        <a className="secondary-button" href={isCamp ? "/futprep/camps" : selectedProgram ? `/sports-fitness/futprep-athletics/${selectedProgram.slug}` : "/sports-fitness/futprep-athletics"}>{isCamp ? "Back to camps" : "Back to program details"}</a>
        {/* Guest first, account after (speed & sign-in brief, 29 Sept, 2.1):
            one tap, email and name already filled in; the registration is
            attached to the account when the code is verified. */}
        <div className="confirmation-save">
          <p><strong>Save this to a free PortPass account</strong>Keep {form.childName.split(" ")[0]}&rsquo;s registration, payments and next term in one place.</p>
          <a className="secondary-button" href={`/signup?as=customer&email=${encodeURIComponent(form.parentEmail.trim())}&name=${encodeURIComponent(form.parentName.trim())}&next=${encodeURIComponent("/account")}`}>Save to an account →</a>
        </div>
        <InstallPrompt heading="Keep PortPass on your phone" lead="Add it to your home screen to check this registration and its payment in one tap. Nothing to download from a store." />
      </section>
    );
  }

  return (
    <section className="registration-shell">
      <div className="registration-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />{intro ? intro.eyebrow : `Futprep · ${selectedProgram ? `${selectedProgram.termName} registration` : "Registration"}`}</div>
          <h1>{intro ? intro.title : "Register your child."}</h1>
          {intro ? (
            <p>{intro.lead}</p>
          ) : selectedProgram ? (
            <p>Registering for <strong>{offerHeadline(selectedProgram)}</strong>.{isCamp ? ` Camp fee ${formatPriceCents(selectedProgram.termFeeCents)}.` : ""} You can change your choice in step 4.</p>
          ) : (
            <p>Choose your child&apos;s class or camp in step 4. There&apos;s no registration fee. You&apos;ll choose how to pay (bank transfer, online banking or cash) there too.</p>
          )}
          {trialHref && !isTrial && <p className="registration-trial-note">New to Futprep? <a href={trialHref}>{trialLabel ?? "Free taster Saturday with a PortPass account"} →</a></p>}
        </div>
        <div className="registration-progress">
          {steps.map((name,index) => (
            <div className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={name}>
              <span>{index < step ? "✓" : index + 1}</span><small>{name}</small>
            </div>
          ))}
        </div>
      </div>

      <form className="registration-form" onSubmit={submit}>
        {step === 0 && (
          <fieldset>
            <legend><span>01</span>Parent / guardian</legend>
            <div className="form-grid">
              <label><span>Full name *</span><input value={form.parentName} onChange={(e)=>set("parentName",e.target.value)} /></label>
              <label><span>Relationship *</span><input value={form.relationship} onChange={(e)=>set("relationship",e.target.value)} placeholder="Mother, father, guardian…" /></label>
              <label><span>Email *</span><input type="email" value={form.parentEmail} onChange={(e)=>set("parentEmail",e.target.value)} /></label>
              <label><span>Phone *</span><PhoneInput required value={form.parentPhone} onChange={(v)=>set("parentPhone",v)} /></label>
              <label className="full-field">
                <span>How did you hear about Futprep? *</span>
                <select value={form.heardAboutUs} onChange={(e)=>set("heardAboutUs",e.target.value)}>
                  <option value="">Choose one</option>
                  {HEARD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {form.heardAboutUs === "referral" && (
                <label className="full-field"><span>Their name or referral code (optional)</span><input value={form.referralCode} maxLength={40} onChange={(e)=>set("referralCode",e.target.value)} placeholder="e.g. Kim Rolle, or a PP- code" /></label>
              )}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset>
            <legend><span>02</span>Child</legend>
            <div className="form-grid">
              <label><span>Child full name *</span><input value={form.childName} onChange={(e)=>set("childName",e.target.value)} /></label>
              <label><span>Date of birth *</span><input type="date" value={form.childDob} onChange={(e)=>set("childDob",e.target.value)} /></label>
              <label><span>Gender *</span><select value={form.gender} onChange={(e)=>set("gender",e.target.value)}><option value="">Choose</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label>
              <label className="full-field"><span>Authorized pickup person(s) *</span><textarea rows={3} value={form.authorizedPickup} onChange={(e)=>set("authorizedPickup",e.target.value)} placeholder="Names and relationship to child" /></label>
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend><span>03</span>Health & safety</legend>
            {returnToken && <p className="form-hint registration-medical-notice" role="note">Please re-enter or confirm your child&apos;s current allergies, conditions and medications.</p>}
            <div className="form-grid">
              <label><span>Emergency contact name *</span><input value={form.emergencyContactName} onChange={(e)=>set("emergencyContactName",e.target.value)} /></label>
              <label><span>Emergency contact phone *</span><PhoneInput required value={form.emergencyContactPhone} onChange={(v)=>set("emergencyContactPhone",v)} /></label>
              <label className="full-field"><span>Allergies</span><textarea rows={2} value={form.allergies} onChange={(e)=>set("allergies",e.target.value)} placeholder="Write none if there are no known allergies" /></label>
              <label className="full-field"><span>Medical conditions</span><textarea rows={2} value={form.medicalConditions} onChange={(e)=>set("medicalConditions",e.target.value)} /></label>
              <label className="full-field"><span>Medications</span><textarea rows={2} value={form.medications} onChange={(e)=>set("medications",e.target.value)} /></label>
              <label className="full-field"><span>Disabilities, developmental needs or special accommodations</span><textarea rows={3} value={form.specialNeeds} onChange={(e)=>set("specialNeeds",e.target.value)} /></label>
              <label className="full-field"><span>Additional notes</span><textarea rows={3} value={form.additionalNotes} onChange={(e)=>set("additionalNotes",e.target.value)} /></label>
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset>
            <legend><span>04</span>{isTrial ? "Class & free Saturday" : "Class & payment"}</legend>
            <div className="choice-section">
              <span className="choice-heading">{isTrial ? "Choose a class *" : "Choose a class or camp *"}</span>
              <div className="class-choice-grid">
                {availability.length === 0 && <p className="form-hint">{closedNotice ?? "Nothing is open for registration right now."} Message Futprep on WhatsApp and we&apos;ll tell you when the next one opens.</p>}
                {availability.map((program) => (
                  <label className={`choice-card ${form.offerKey===offerKey(program) ? "is-selected" : ""}`} key={offerKey(program)}>
                    <input type="radio" name="program" checked={form.offerKey===offerKey(program)} onChange={()=>chooseOffer(program)} />
                    <span className="choice-check" />
                    {program.programType === "camp" && <span className="coming-soon-pill">Camp</span>}
                    <strong>{program.name}</strong>
                    <span>Ages {program.ageLabel} · {scheduleLine(program)}</span>
                    {program.locationNote && <small>{program.locationNote}</small>}
                    <small>{isTrial ? "Free first Saturday" : program.spotsRemaining === 0 ? "Full · join the waitlist" : `${program.spotsRemaining} of ${program.capacity} spots remaining`}{!isTrial && program.programType === "camp" ? ` · ${formatPriceCents(program.termFeeCents)}` : ""}</small>
                  </label>
                ))}
              </div>
            </div>

            {isTrial && selectedProgram && (
              <div className="choice-section">
                <span className="choice-heading">Your free taster Saturday *</span>
                <div className="payment-method-grid">
                  {saturdays.length === 0 && <p className="form-hint">No taster spots left for this class. Register for the term to play.</p>}
                  {saturdays.map((s) => (
                    <label className={`choice-card ${trialSessionId===s.sessionId ? "is-selected" : ""}${s.spotsLeft === 0 ? " is-disabled" : ""}`} key={s.sessionId}>
                      <input type="radio" name="trialSaturday" checked={trialSessionId===s.sessionId} disabled={s.spotsLeft === 0} onChange={()=>{ setTrialSessionId(s.sessionId); setError(""); }} />
                      <span className="choice-check" /><strong>{longDate(s.date)}</strong>
                      <span>{programTimeRange(selectedProgram)} · {selectedProgram.location}</span>
                      <small>{s.spotsLeft === 0 ? "Free spots taken" : `${s.spotsLeft} free ${s.spotsLeft === 1 ? "spot" : "spots"} left`}</small>
                    </label>
                  ))}
                </div>
                <p className="form-hint">One free taster per child. Nothing to pay.</p>
              </div>
            )}

            {isWaitlist && selectedProgram && (
              <div className="registration-total registration-waitlist"><span>{selectedProgram.name} is full. Join the waitlist and Futprep will message you if a spot opens. Nothing to pay now.</span><strong>Waitlist</strong></div>
            )}

            {joinApplies && joinQuote && (
              <div className="registration-total"><span>Rest of {selectedProgram?.termName ?? "the term"}: {joinQuote.remainingSessions} {joinQuote.remainingSessions === 1 ? "Saturday" : "Saturdays"} × {formatPriceCents(joinQuote.weeklyFeeCents)}</span><strong>{formatPriceCents(joinQuote.amountCents)}</strong></div>
            )}

            {isCamp && !isWaitlist && selectedProgram && (
              <div className="registration-total"><span>Camp fee ({formatDateRange(selectedProgram.termStartDate, selectedProgram.termEndDate)})</span><strong>{formatPriceCents(selectedProgram.termFeeCents)}</strong></div>
            )}

            {!isCamp && !isTrial && !isWaitlist && !joinApplies && <div className="choice-section">
              <span className="choice-heading">Payment plan *</span>
              <div className="payment-method-grid">
                <label className={`choice-card ${form.paymentFrequency==="weekly" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentFrequency==="weekly"} onChange={()=>set("paymentFrequency","weekly")} />
                  <span className="choice-check" /><strong>Pay weekly</strong>
                  <span>{selectedProgram ? `${formatPriceCents(selectedProgram.weeklyFeeCents)} per class` : "Choose a class first"}</span>
                </label>
                <label className={`choice-card ${form.paymentFrequency==="term" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentFrequency==="term"} onChange={()=>set("paymentFrequency","term")} />
                  <span className="choice-check" /><strong>Pay full term</strong>
                  <span>{selectedProgram ? `${formatPriceCents(selectedProgram.termFeeCents)} for ${selectedProgram.termName}` : "Choose a class first"}</span>
                  <small>Best value</small>
                </label>
              </div>
            </div>}

            {!isTrial && !isWaitlist && <div className="choice-section">
              <span className="choice-heading">Payment method *</span>
              <div className="payment-method-grid">
                <label className={`choice-card ${form.paymentMethod==="cash" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentMethod==="cash"} onChange={()=>set("paymentMethod","cash")} />
                  <span className="choice-check" /><strong>Cash</strong><span>Pay your Futprep coach in person.</span>
                </label>
                <label className={`choice-card ${form.paymentMethod==="bank_transfer" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentMethod==="bank_transfer"} onChange={()=>set("paymentMethod","bank_transfer")} />
                  <span className="choice-check" /><strong>Bank transfer</strong><span>Deposit or wire at your bank.</span>
                </label>
                <label className={`choice-card ${form.paymentMethod==="online_banking" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentMethod==="online_banking"} onChange={()=>set("paymentMethod","online_banking")} />
                  <span className="choice-check" /><strong>Online banking transfer</strong><span>Pay from your own bank&apos;s app.</span>
                </label>
                <div className="choice-card is-disabled"><span className="coming-soon-pill">Coming soon</span><strong>Online card payment</strong><span>Not available yet.</span></div>
              </div>
            </div>}

            {!isTrial && !isWaitlist && (form.paymentMethod === "bank_transfer" || form.paymentMethod === "online_banking") && (
              <div className="bank-panel">
                <div>
                  <span className="choice-heading">{form.paymentMethod === "online_banking" ? "Pay via online banking" : "Futprep bank transfer"}</span>
                  <p>{form.paymentMethod === "online_banking"
                    ? "Send this from your own bank's online or mobile banking app."
                    : "Visit your bank and transfer to the account below."} You'll get a registration code after you submit — use it as the transfer reference so Futprep can match your payment.</p>
                </div>
                <dl className="bank-details">
                  <div><dt>Bank</dt><dd>{FUTPREP_BANK_DETAILS.bankName}</dd></div>
                  <div><dt>Account name</dt><dd>{FUTPREP_BANK_DETAILS.accountName}</dd></div>
                  <div><dt>Account number</dt><dd>{FUTPREP_BANK_DETAILS.accountNumber}</dd></div>
                  <div><dt>SWIFT code</dt><dd>{FUTPREP_BANK_DETAILS.swiftCode}</dd></div>
                </dl>
              </div>
            )}

            {selectedPrice !== null && !isCamp && !joinApplies && <div className="registration-total"><span>{form.paymentFrequency==="term" ? `${selectedProgram?.termName ?? "Term"} amount` : "Weekly class amount"}</span><strong>{formatPriceCents(selectedPrice)}</strong></div>}
          </fieldset>
        )}

        {step === 4 && (
          <fieldset>
            <legend><span>05</span>Review & consent</legend>
            <div className="registration-review">
              <div><span>Child</span><strong>{form.childName}</strong><small>{form.childDob}</small></div>
              <div><span>{isCamp ? "Camp" : "Class"}</span><strong>{selectedProgram?.name}</strong><small>{selectedProgram ? scheduleLine(selectedProgram) : ""}</small></div>
              {isTrial ? (
                <div><span>Free taster</span><strong>{chosenSaturday ? longDate(chosenSaturday.date) : ""}</strong><small>Nothing to pay</small></div>
              ) : isWaitlist ? (
                <div><span>Waitlist</span><strong>Class full</strong><small>Nothing to pay now</small></div>
              ) : (
                <div><span>Payment</span><strong>{isCamp ? "Camp fee" : joinApplies ? "Rest of term" : form.paymentFrequency==="term" ? "Full term" : "Weekly"} · {selectedPrice!==null ? formatPriceCents(selectedPrice) : ""}</strong><small>{paymentMethodLabel(form.paymentMethod)}</small></div>
              )}
              <div><span>Parent/guardian</span><strong>{form.parentName}</strong><small>{form.parentEmail}</small></div>
            </div>

            <div className="photo-consent">
              <span className="choice-heading">Photo & video permission *</span>
              <p>Futprep may take photographs or video during sessions for promotional use.</p>
              <div className="inline-choice">
                <label><input type="radio" checked={form.photoConsent==="yes"} onChange={()=>set("photoConsent","yes")} /> Yes, I give permission</label>
                <label><input type="radio" checked={form.photoConsent==="no"} onChange={()=>set("photoConsent","no")} /> No, I do not give permission</label>
              </div>
            </div>

            <div className="single-consent">
              <label>
                <input type="checkbox" checked={form.consentAccepted} onChange={(e)=>set("consentAccepted",e.target.checked)} />
                <span>I confirm that I am the parent/legal guardian or am authorized to register this child. I confirm that the information provided is accurate and complete. I understand and accept the normal risks associated with participation in football/soccer activities. I authorize Futprep staff to take reasonable action, including first aid and contacting emergency medical services, if necessary for my child&apos;s health or safety. I consent to Futprep and authorized PortPass users securely using the registration, medical, emergency, attendance and payment information provided to administer my child&apos;s participation. I confirm that the medical, special-needs and authorized-pickup information provided is current, and I agree to inform Futprep of any changes.</span>
              </label>
            </div>

            <label className="signature-field">
              <span>Parent/guardian electronic signature *</span>
              <input value={form.signatureName} onChange={(e)=>set("signatureName",e.target.value)} placeholder="Type your full name" />
              <small>Typing your name confirms the consent above. The consent version and submission time are recorded automatically. How this information is used and how long it is kept: <a href="/privacy#children" target="_blank" rel="noopener">Privacy Policy</a>.</small>
            </label>
          </fieldset>
        )}

        {error && <p className="form-error registration-error" role="alert">{error}</p>}

        <div className="registration-actions">
          {step > 0 ? <button className="secondary-button" type="button" onClick={()=>setStep((s)=>s-1)} disabled={busy}>← Back</button> : <a className="secondary-button" href={isCamp ? "/futprep/camps" : selectedProgram ? `/sports-fitness/futprep-athletics/${selectedProgram.slug}` : "/sports-fitness/futprep-athletics"}>{isCamp ? "← Camp details" : "← Program details"}</a>}
          {step < steps.length - 1
            ? <button className="primary-button" type="button" onClick={next}>Continue →</button>
            : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : isTrial ? "Book the free Saturday →" : isWaitlist ? "Join the waitlist →" : "Submit registration →"}</button>}
        </div>
      </form>
    </section>
  );
}
