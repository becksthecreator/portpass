"use client";

import { FormEvent, useState } from "react";

type Props = {
  referenceCode: string;
  childName: string;
  programName: string;
};

export function CompleteRegistrationForm({ referenceCode, childName, programName }: Props) {
  const [childDob, setChildDob] = useState("");
  const [gender, setGender] = useState("");
  const [relationship, setRelationship] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [authorizedPickup, setAuthorizedPickup] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");
  const [photoConsent, setPhotoConsent] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/futprep/registrations/${referenceCode}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childDob, gender, relationship, parentName, parentEmail, parentPhone,
          emergencyContactName, emergencyContactPhone, authorizedPickup,
          allergies, medicalConditions, medications, specialNeeds,
          photoConsent, paymentFrequency, paymentMethod, signatureName, consentAccepted,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not complete this registration.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete this registration.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="registration-confirmation">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow">Registration complete</div>
        <h1>{childName} is all set.</h1>
        <p>Thanks for finishing {childName}&rsquo;s registration for {programName}. Futprep has everything needed now.</p>
        <a className="primary-button" href={`/futprep/my/${referenceCode}`}>Check registration status →</a>
      </section>
    );
  }

  return (
    <form className="registration-form" onSubmit={submit}>
      <fieldset>
        <legend><span>01</span>Child</legend>
        <div className="form-grid">
          <label><span>Date of birth *</span><input type="date" required value={childDob} onChange={(e) => setChildDob(e.target.value)} /></label>
          <label><span>Gender *</span><select required value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          <label className="full-field"><span>Authorized pickup person(s) *</span><textarea rows={2} required value={authorizedPickup} onChange={(e) => setAuthorizedPickup(e.target.value)} placeholder="Names and relationship to child" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span>02</span>Parent / guardian</legend>
        <div className="form-grid">
          <label><span>Full name</span><input value={parentName} onChange={(e) => setParentName(e.target.value)} /></label>
          <label><span>Relationship</span><input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Mother, father, guardian…" /></label>
          <label><span>Email</span><input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} /></label>
          <label><span>Phone</span><input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span>03</span>Health & safety</legend>
        <div className="form-grid">
          <label><span>Emergency contact name *</span><input required value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} /></label>
          <label><span>Emergency contact phone *</span><input type="tel" required value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} /></label>
          <label className="full-field"><span>Allergies</span><textarea rows={2} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Write none if there are no known allergies" /></label>
          <label className="full-field"><span>Medical conditions</span><textarea rows={2} value={medicalConditions} onChange={(e) => setMedicalConditions(e.target.value)} placeholder="Write none if there are none" /></label>
          <label className="full-field"><span>Medications</span><textarea rows={2} value={medications} onChange={(e) => setMedications(e.target.value)} placeholder="Write none if there are none" /></label>
          <label className="full-field"><span>Disabilities, developmental needs or special accommodations</span><textarea rows={3} value={specialNeeds} onChange={(e) => setSpecialNeeds(e.target.value)} placeholder="Write none if there are none" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span>04</span>Payment</legend>
        <div className="choice-section">
          <span className="choice-heading">Payment plan *</span>
          <div className="payment-method-grid">
            <label className={`choice-card ${paymentFrequency === "weekly" ? "is-selected" : ""}`}>
              <input type="radio" checked={paymentFrequency === "weekly"} onChange={() => setPaymentFrequency("weekly")} />
              <span className="choice-check" /><strong>Pay weekly</strong>
            </label>
            <label className={`choice-card ${paymentFrequency === "term" ? "is-selected" : ""}`}>
              <input type="radio" checked={paymentFrequency === "term"} onChange={() => setPaymentFrequency("term")} />
              <span className="choice-check" /><strong>Pay full term</strong><small>Best value</small>
            </label>
          </div>
        </div>
        <div className="choice-section">
          <span className="choice-heading">Payment method *</span>
          <div className="payment-method-grid">
            <label className={`choice-card ${paymentMethod === "cash" ? "is-selected" : ""}`}>
              <input type="radio" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} />
              <span className="choice-check" /><strong>Cash</strong><span>Pay your Futprep coach in person.</span>
            </label>
            <label className={`choice-card ${paymentMethod === "bank_transfer" ? "is-selected" : ""}`}>
              <input type="radio" checked={paymentMethod === "bank_transfer"} onChange={() => setPaymentMethod("bank_transfer")} />
              <span className="choice-check" /><strong>Bank transfer</strong>
            </label>
            <label className={`choice-card ${paymentMethod === "online_banking" ? "is-selected" : ""}`}>
              <input type="radio" checked={paymentMethod === "online_banking"} onChange={() => setPaymentMethod("online_banking")} />
              <span className="choice-check" /><strong>Online banking transfer</strong>
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend><span>05</span>Consent</legend>
        <div className="photo-consent">
          <span className="choice-heading">Photo & video permission *</span>
          <p>Futprep may take photographs or video during sessions for promotional use.</p>
          <div className="inline-choice">
            <label><input type="radio" checked={photoConsent === "yes"} onChange={() => setPhotoConsent("yes")} /> Yes, I give permission</label>
            <label><input type="radio" checked={photoConsent === "no"} onChange={() => setPhotoConsent("no")} /> No, I do not give permission</label>
          </div>
        </div>
        <div className="single-consent">
          <label>
            <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
            <span>I confirm that I am the parent/legal guardian or am authorized to register this child. I confirm the information provided is accurate and complete. I understand and accept the normal risks associated with participation in football/soccer activities. I authorize Futprep staff to take reasonable action, including first aid and contacting emergency medical services, if necessary. I consent to Futprep and authorized PortPass users securely using this information to administer my child&apos;s participation.</span>
          </label>
        </div>
        <label className="signature-field">
          <span>Parent/guardian electronic signature *</span>
          <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Type your full name" />
        </label>
      </fieldset>

      {error && <p className="form-error registration-error" role="alert">{error}</p>}

      <div className="registration-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : "Finish registration →"}</button>
      </div>
    </form>
  );
}
