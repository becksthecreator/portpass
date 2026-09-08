"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  FUTPREP_BANK_DETAILS,
  FUTPREP_PROGRAMS,
  FUTPREP_TERM,
  formatMoney,
  programBySlug,
  programTimeRange,
} from "../config";

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
  programSlug: string; paymentFrequency: string; paymentMethod: string;
  photoConsent: string; signatureName: string; consentAccepted: boolean;
};

type Availability = { slug: string; registered: number; spotsRemaining: number; capacity: number };
type RegistrationResult = {
  referenceCode: string;
  program: (typeof FUTPREP_PROGRAMS)[number];
  amountDueCents: number;
};

const initial: FormState = {
  parentName:"", parentEmail:"", parentPhone:"", relationship:"",
  childName:"", childDob:"", gender:"", authorizedPickup:"",
  emergencyContactName:"", emergencyContactPhone:"",
  allergies:"", medicalConditions:"", medications:"", specialNeeds:"", additionalNotes:"",
  programSlug:"", paymentFrequency:"", paymentMethod:"",
  photoConsent:"", signatureName:"", consentAccepted:false,
};

const steps = ["Parent","Child","Health & safety","Class & payment","Consent"];

function ageAtStart(dob: string) {
  if (!dob) return null;
  const birth = new Date(`${dob}T12:00:00Z`);
  const start = new Date(`${FUTPREP_TERM.startDate}T12:00:00Z`);
  if (Number.isNaN(birth.valueOf())) return null;
  let age = start.getUTCFullYear() - birth.getUTCFullYear();
  const delta = start.getUTCMonth() - birth.getUTCMonth();
  if (delta < 0 || (delta === 0 && start.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export function RegistrationForm() {
  const [form, setForm] = useState<FormState>(initial);
  const [step, setStep] = useState(0);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const selectedProgram = useMemo(() => programBySlug(form.programSlug), [form.programSlug]);
  const selectedPrice = selectedProgram && form.paymentFrequency
    ? (form.paymentFrequency === "term" ? selectedProgram.termFeeCents : selectedProgram.weeklyFeeCents)
    : null;

  useEffect(() => {
    fetch("/api/futprep/lil-kickers/availability", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.availability && setAvailability(data.availability))
      .catch(() => {});
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function validate() {
    if (step === 0) {
      if (!form.parentName || !form.parentEmail || !form.parentPhone || !form.relationship) return "Complete all parent/guardian details.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parentEmail)) return "Enter a valid email address.";
    }
    if (step === 1) {
      if (!form.childName || !form.childDob || !form.gender || !form.authorizedPickup) return "Complete the child and pickup details.";
      const age = ageAtStart(form.childDob);
      if (age === null || age < 3 || age > 7) return "Term 1 currently serves children ages 3–7.";
    }
    if (step === 2 && (!form.emergencyContactName || !form.emergencyContactPhone)) return "Add an emergency contact.";
    if (step === 3) {
      if (!form.programSlug || !form.paymentFrequency || !form.paymentMethod) return "Choose a class, payment plan, and payment method.";
      const age = ageAtStart(form.childDob);
      if (selectedProgram && age !== null && (age < selectedProgram.ageMin || age > selectedProgram.ageMax)) return `${selectedProgram.name} is for ages ${selectedProgram.ageMin}–${selectedProgram.ageMax}.`;
    }
    return "";
  }

  function next() {
    const message = validate();
    if (message) return setError(message);
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
      const response = await fetch("/api/futprep/lil-kickers/registrations", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(form),
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

  if (result) {
    return (
      <section className="registration-confirmation">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow">Registration received</div>
        <h1>{form.childName} is on the list.</h1>
        <p className="confirmation-lead">Futprep has received the Term 1 registration. Payment stays pending until Futprep records or confirms it.</p>
        <div className="confirmation-reference"><span>Registration reference</span><strong>{result.referenceCode}</strong></div>
        <dl className="confirmation-grid">
          <div><dt>Class</dt><dd>{result.program.name}</dd></div>
          <div><dt>Time</dt><dd>Saturday · {programTimeRange(result.program)}</dd></div>
          <div><dt>Location</dt><dd>{FUTPREP_TERM.location}</dd></div>
          <div><dt>Plan</dt><dd>{form.paymentFrequency === "term" ? "Full term" : "Weekly"}</dd></div>
          <div><dt>Amount</dt><dd>{formatMoney(result.amountDueCents)}{form.paymentFrequency === "weekly" ? " per class" : ""}</dd></div>
          <div><dt>Status</dt><dd><span className="status status-submitted">Payment pending</span></dd></div>
        </dl>
        <div className="payment-instruction">
          <strong>{form.paymentMethod === "cash" ? "Cash payment" : paymentMethodLabel(form.paymentMethod)}</strong>
          {form.paymentMethod === "cash" ? (
            <p>Please give the cash payment directly to Coach Bex in person. Futprep will update the payment status after it is received.</p>
          ) : (
            <>
              <p>{form.paymentMethod === "online_banking"
                ? "Send this from your own bank's online or mobile banking app. Include the parent/guardian name and child's name in the transfer reference."
                : "Use the parent/guardian name and child's name in the transfer reference so Futprep can match the payment."}</p>
              <div className="bank-details compact">
                <span>{FUTPREP_BANK_DETAILS.bankName}</span>
                <span>{FUTPREP_BANK_DETAILS.accountName}</span>
                <span>{FUTPREP_BANK_DETAILS.accountNumber}</span>
                <span>SWIFT {FUTPREP_BANK_DETAILS.swiftCode}</span>
              </div>
            </>
          )}
        </div>
        <a className="primary-button" href="/futprep/lil-kickers">Back to program details →</a>
      </section>
    );
  }

  return (
    <section className="registration-shell">
      <div className="registration-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Futprep · Term 1 registration</div>
          <h1>Register your child.</h1>
          <p>Saturday sessions at {FUTPREP_TERM.location}. Registration is free.</p>
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
              <label><span>Phone *</span><input type="tel" value={form.parentPhone} onChange={(e)=>set("parentPhone",e.target.value)} /></label>
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
            <div className="form-grid">
              <label><span>Emergency contact name *</span><input value={form.emergencyContactName} onChange={(e)=>set("emergencyContactName",e.target.value)} /></label>
              <label><span>Emergency contact phone *</span><input type="tel" value={form.emergencyContactPhone} onChange={(e)=>set("emergencyContactPhone",e.target.value)} /></label>
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
            <legend><span>04</span>Class & payment</legend>
            <div className="choice-section">
              <span className="choice-heading">Choose a class *</span>
              <div className="class-choice-grid">
                {FUTPREP_PROGRAMS.map((program) => {
                  const open = availability.find((a)=>a.slug===program.slug);
                  return (
                    <label className={`choice-card ${form.programSlug===program.slug ? "is-selected" : ""}`} key={program.slug}>
                      <input type="radio" name="program" checked={form.programSlug===program.slug} onChange={()=>set("programSlug",program.slug)} />
                      <span className="choice-check" />
                      <strong>{program.name}</strong>
                      <span>Ages {program.ageMin}–{program.ageMax} · Saturday {programTimeRange(program)}</span>
                      <small>{open ? `${open.spotsRemaining} of ${open.capacity} spots remaining` : `${program.capacity} spots`}</small>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="choice-section">
              <span className="choice-heading">Payment plan *</span>
              <div className="payment-method-grid">
                <label className={`choice-card ${form.paymentFrequency==="weekly" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentFrequency==="weekly"} onChange={()=>set("paymentFrequency","weekly")} />
                  <span className="choice-check" /><strong>Pay weekly</strong>
                  <span>{selectedProgram ? `${formatMoney(selectedProgram.weeklyFeeCents)} per class` : "Choose a class first"}</span>
                </label>
                <label className={`choice-card ${form.paymentFrequency==="term" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentFrequency==="term"} onChange={()=>set("paymentFrequency","term")} />
                  <span className="choice-check" /><strong>Pay full term</strong>
                  <span>{selectedProgram ? `${formatMoney(selectedProgram.termFeeCents)} for Term 1` : "Choose a class first"}</span>
                  <small>Best value</small>
                </label>
              </div>
            </div>

            <div className="choice-section">
              <span className="choice-heading">Payment method *</span>
              <div className="payment-method-grid">
                <label className={`choice-card ${form.paymentMethod==="cash" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentMethod==="cash"} onChange={()=>set("paymentMethod","cash")} />
                  <span className="choice-check" /><strong>Cash</strong><span>Pay Coach Bex in person.</span>
                </label>
                <label className={`choice-card ${form.paymentMethod==="bank_transfer" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentMethod==="bank_transfer"} onChange={()=>set("paymentMethod","bank_transfer")} />
                  <span className="choice-check" /><strong>Bank transfer</strong><span>Deposit or wire at your bank.</span>
                </label>
                <label className={`choice-card ${form.paymentMethod==="online_banking" ? "is-selected" : ""}`}>
                  <input type="radio" checked={form.paymentMethod==="online_banking"} onChange={()=>set("paymentMethod","online_banking")} />
                  <span className="choice-check" /><strong>Online banking transfer</strong><span>Pay from your own bank&apos;s app.</span>
                </label>
                <div className="choice-card is-disabled"><span className="coming-soon-pill">Coming soon</span><strong>Online card payment</strong><span>Pay securely through PortPass.</span></div>
              </div>
            </div>

            {(form.paymentMethod === "bank_transfer" || form.paymentMethod === "online_banking") && (
              <div className="bank-panel">
                <div>
                  <span className="choice-heading">{form.paymentMethod === "online_banking" ? "Pay via online banking" : "Futprep bank transfer"}</span>
                  <p>{form.paymentMethod === "online_banking"
                    ? "Send this from your own bank's online or mobile banking app. Include the parent/guardian name and child's name in the transfer reference."
                    : "Visit your bank and transfer to the account below. Include the parent/guardian name and child's name in the transfer reference."}</p>
                </div>
                <dl className="bank-details">
                  <div><dt>Bank</dt><dd>{FUTPREP_BANK_DETAILS.bankName}</dd></div>
                  <div><dt>Account name</dt><dd>{FUTPREP_BANK_DETAILS.accountName}</dd></div>
                  <div><dt>Account number</dt><dd>{FUTPREP_BANK_DETAILS.accountNumber}</dd></div>
                  <div><dt>SWIFT code</dt><dd>{FUTPREP_BANK_DETAILS.swiftCode}</dd></div>
                </dl>
              </div>
            )}

            {selectedPrice !== null && <div className="registration-total"><span>{form.paymentFrequency==="term" ? "Term 1 amount" : "Weekly class amount"}</span><strong>{formatMoney(selectedPrice)}</strong></div>}
          </fieldset>
        )}

        {step === 4 && (
          <fieldset>
            <legend><span>05</span>Review & consent</legend>
            <div className="registration-review">
              <div><span>Child</span><strong>{form.childName}</strong><small>{form.childDob}</small></div>
              <div><span>Class</span><strong>{selectedProgram?.name}</strong><small>Saturday · {selectedProgram ? programTimeRange(selectedProgram) : ""}</small></div>
              <div><span>Payment</span><strong>{form.paymentFrequency==="term" ? "Full term" : "Weekly"} · {selectedPrice!==null ? formatMoney(selectedPrice) : ""}</strong><small>{paymentMethodLabel(form.paymentMethod)}</small></div>
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
              <small>Typing your name confirms the consent above. The consent version and submission time are recorded automatically.</small>
            </label>
          </fieldset>
        )}

        {error && <p className="form-error registration-error" role="alert">{error}</p>}

        <div className="registration-actions">
          {step > 0 ? <button className="secondary-button" type="button" onClick={()=>setStep((s)=>s-1)} disabled={busy}>← Back</button> : <a className="secondary-button" href="/futprep/lil-kickers">← Program details</a>}
          {step < steps.length - 1
            ? <button className="primary-button" type="button" onClick={next}>Continue →</button>
            : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit registration →"}</button>}
        </div>
      </form>
    </section>
  );
}
