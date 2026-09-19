"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FutprepRegistrationDetail } from "@/db/staff";

type ProgramOption = { slug: string; name: string; weeklyFeeCents: number; termFeeCents: number };

function money(cents: number) {
  return new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0 }).format(cents / 100);
}

function dollarsInput(cents: number) {
  return (cents / 100).toFixed(2);
}

const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_PROGRAM: "That programme isn't available.",
  PROGRAM_NOT_AVAILABLE: "That programme has no active term to bill against.",
  INVALID_AMOUNT: "Enter a valid amount.",
  INVALID_DATE: "Enter a valid date.",
  REGISTRATION_NOT_FOUND: "This registration could not be found.",
  PAYMENT_NOT_FOUND: "This payment could not be found.",
};

function friendlyError(message: string) {
  return FRIENDLY_ERRORS[message] ?? message;
}

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RegistrationDetailEditor({ detail, programs }: { detail: FutprepRegistrationDetail; programs: ProgramOption[] }) {
  const router = useRouter();

  const [childName, setChildName] = useState(detail.child_name);
  const [childDob, setChildDob] = useState(detail.child_dob ?? "");
  const [gender, setGender] = useState(detail.gender ?? "");
  const [programSlug, setProgramSlug] = useState(detail.program_slug);
  const [relationship, setRelationship] = useState(detail.relationship ?? "");
  const [parentName, setParentName] = useState(detail.parent_name ?? "");
  const [parentEmail, setParentEmail] = useState(detail.parent_email ?? "");
  const [parentPhone, setParentPhone] = useState(detail.parent_phone ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(detail.emergency_contact_name ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(detail.emergency_contact_phone ?? "");
  const [authorizedPickup, setAuthorizedPickup] = useState(detail.authorized_pickup ?? "");
  const [allergies, setAllergies] = useState(detail.allergies ?? "");
  const [medicalConditions, setMedicalConditions] = useState(detail.medical_conditions ?? "");
  const [medications, setMedications] = useState(detail.medications ?? "");
  const [specialNeeds, setSpecialNeeds] = useState(detail.special_needs ?? "");
  const [photoConsent, setPhotoConsent] = useState(detail.photo_consent ?? "");
  const [paymentFrequency, setPaymentFrequency] = useState(detail.payment_frequency);
  const [paymentMethod, setPaymentMethod] = useState(detail.payment_method ?? "");
  const [amountDue, setAmountDue] = useState(dollarsInput(detail.amount_due_cents));
  const [additionalNotes, setAdditionalNotes] = useState(detail.additional_notes ?? "");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const [payAmount, setPayAmount] = useState(dollarsInput(Math.max(0, detail.amount_due_cents - detail.paid_cents)));
  const [payMethod, setPayMethod] = useState("cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");

  const selectedProgram = useMemo(() => programs.find((p) => p.slug === programSlug), [programs, programSlug]);
  const suggestedAmountCents = selectedProgram
    ? (paymentFrequency === "term" ? selectedProgram.termFeeCents : selectedProgram.weeklyFeeCents)
    : detail.amount_due_cents;

  function applyProgramChange(slug: string) {
    setProgramSlug(slug);
    const program = programs.find((p) => p.slug === slug);
    if (program) setAmountDue(dollarsInput(paymentFrequency === "term" ? program.termFeeCents : program.weeklyFeeCents));
  }

  function applyFrequencyChange(next: "weekly" | "term") {
    setPaymentFrequency(next);
    if (selectedProgram) setAmountDue(dollarsInput(next === "term" ? selectedProgram.termFeeCents : selectedProgram.weeklyFeeCents));
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    setSaved(false);

    const amountDueCents = Math.round(Number(amountDue) * 100);
    const overrideActive = amountDueCents !== detail.amount_due_cents && amountDueCents !== suggestedAmountCents;
    const amountChangedAtAll = amountDueCents !== detail.amount_due_cents;

    const body = {
      childName,
      childDob: childDob || null,
      gender: gender || null,
      programSlug,
      relationship: relationship || null,
      parentName: parentName || null,
      parentEmail: parentEmail || null,
      parentPhone: parentPhone || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      authorizedPickup: authorizedPickup || null,
      allergies,
      medicalConditions,
      medications,
      specialNeeds,
      photoConsent: photoConsent || null,
      paymentFrequency,
      paymentMethod: paymentMethod || null,
      additionalNotes,
      ...(overrideActive || (amountChangedAtAll && programSlug === detail.program_slug && paymentFrequency === detail.payment_frequency)
        ? { amountDueCentsOverride: amountDueCents }
        : {}),
    };

    const response = await fetch(`/api/futprep/staff/registrations/${detail.id}/detail`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setSaveError(friendlyError(data.error ?? "Could not save changes."));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function recordPayment() {
    const dollars = Number(payAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) { setPayError("Enter a valid amount."); return; }
    setPayBusy(true);
    setPayError("");
    const response = await fetch("/api/futprep/staff/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registrationId: detail.id,
        amountCents: Math.round(dollars * 100),
        method: payMethod,
        receivedAt: payDate,
        reference: payReference || undefined,
        note: payNote || undefined,
      }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setPayBusy(false);
    if (!response.ok) { setPayError(friendlyError(data.error ?? "Payment could not be recorded.")); return; }
    setPayReference("");
    setPayNote("");
    router.refresh();
  }

  async function voidPayment(paymentId: number) {
    if (!window.confirm("Void this payment? This removes it from the record — you can re-record the correct amount afterward.")) return;
    const reason = window.prompt("Optional note for why this is being voided:") ?? "";
    const response = await fetch(`/api/futprep/staff/payments/${paymentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (response.ok) router.refresh();
  }

  function sendCompletionWhatsApp() {
    if (!parentPhone) return;
    const link = `${window.location.origin}/futprep/my/${detail.reference_code}/complete`;
    const message = `Hi! We've started ${detail.child_name}'s Futprep registration. Please finish it here: ${link}`;
    window.open(`https://wa.me/${parentPhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  const balanceCents = Math.max(0, detail.amount_due_cents - detail.paid_cents);
  const medicalBlank = detail.allergies === null && detail.medical_conditions === null && detail.medications === null && detail.special_needs === null;

  return (
    <div className="detail-editor">
      <div className="staff-page-intro">
        <div>
          <span className="section-kicker">{detail.reference_code} · {detail.program_name}</span>
          <h1>{detail.child_name}</h1>
        </div>
        <div className="staff-status-stack">
          <span className="status status-submitted">{detail.registration_status}</span>
          <span className="status status-approved">{detail.payment_status}</span>
        </div>
      </div>

      <div className="staff-summary staff-summary-four">
        <article><span>Amount due</span><strong>{money(detail.amount_due_cents)}</strong></article>
        <article><span>Collected</span><strong>{money(detail.paid_cents)}</strong></article>
        <article><span>Balance</span><strong className={balanceCents > 0 ? "money-outstanding" : "money-settled"}>{money(balanceCents)}</strong></article>
        <article><span>Submitted</span><strong className="detail-small-stat">{formatWhen(detail.submitted_at)}</strong></article>
      </div>

      {detail.registration_status === "pending_details" && detail.parent_phone && (
        <div className="pending-details-flag">
          <strong>Pending details</strong> — the parent hasn&rsquo;t finished this registration yet.
          <button type="button" onClick={sendCompletionWhatsApp}>Send completion link on WhatsApp →</button>
        </div>
      )}

      <div className="detail-grid">
        <section className="detail-panel">
          <h2>Child</h2>
          <label><span>Name</span><input value={childName} onChange={(e) => setChildName(e.target.value)} /></label>
          <label><span>Date of birth</span><input type="date" value={childDob} onChange={(e) => setChildDob(e.target.value)} /></label>
          <label><span>Gender</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Not on file yet</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label><span>Programme</span>
            <select value={programSlug} onChange={(e) => applyProgramChange(e.target.value)}>
              {programs.map((program) => <option key={program.slug} value={program.slug}>{program.name}</option>)}
            </select>
          </label>
          {programSlug !== detail.program_slug && (
            <p className="detail-hint">Moving classes recalculates the amount due from {selectedProgram?.name}&rsquo;s term — reflected below, and still overridable.</p>
          )}
        </section>

        <section className="detail-panel">
          <h2>Parent / guardian</h2>
          <label><span>Relationship to child</span><input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Not on file yet" /></label>
          <label><span>Name</span><input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Not on file yet" /></label>
          <label><span>Email</span><input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="Not on file yet" /></label>
          <label><span>Phone</span><input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="Not on file yet" /></label>
        </section>

        <section className="detail-panel">
          <h2>Emergency contact</h2>
          <p className="detail-hint">Shown exactly as on file — never assumed to be the parent above.</p>
          <label><span>Name</span><input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Not on file yet" /></label>
          <label><span>Phone</span><input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="Not on file yet" /></label>
          <label><span>Authorized pickup</span><input value={authorizedPickup} onChange={(e) => setAuthorizedPickup(e.target.value)} placeholder="Not on file yet" /></label>
        </section>

        <section className="detail-panel">
          <h2>Payment</h2>
          <label><span>Frequency</span>
            <select value={paymentFrequency} onChange={(e) => applyFrequencyChange(e.target.value as "weekly" | "term")}>
              <option value="weekly">Weekly</option>
              <option value="term">Full term</option>
            </select>
          </label>
          <label><span>Method</span>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">Not chosen yet</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="online_banking">Online banking transfer</option>
            </select>
          </label>
          <label><span>Amount due (suggested {money(suggestedAmountCents)})</span>
            <div className="detail-money-input"><span>$</span><input inputMode="decimal" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} /></div>
          </label>
          {Math.round(Number(amountDue) * 100) !== suggestedAmountCents && (
            <p className="detail-hint">This overrides the term rate — use it for an agreed arrangement.</p>
          )}
        </section>

        <section className="detail-panel detail-panel-wide">
          <h2>Medical &amp; consent</h2>
          {detail.medical_info_source && (
            <p className="detail-hint">
              Medical info currently on file was entered by <strong>{detail.medical_info_source === "staff" ? "staff" : "the parent"}</strong>.
            </p>
          )}
          {medicalBlank && <p className="detail-hint">No information on file yet — nothing has been asked or answered.</p>}
          <label><span>Allergies</span><textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="No information on file yet" rows={2} /></label>
          <label><span>Medical conditions</span><textarea value={medicalConditions} onChange={(e) => setMedicalConditions(e.target.value)} placeholder="No information on file yet" rows={2} /></label>
          <label><span>Medications</span><textarea value={medications} onChange={(e) => setMedications(e.target.value)} placeholder="No information on file yet" rows={2} /></label>
          <label><span>Special needs</span><textarea value={specialNeeds} onChange={(e) => setSpecialNeeds(e.target.value)} placeholder="No information on file yet" rows={2} /></label>
          <label><span>Photo / video consent</span>
            <select value={photoConsent} onChange={(e) => setPhotoConsent(e.target.value)}>
              <option value="">No information on file yet</option>
              <option value="yes">Allowed</option>
              <option value="no">Not allowed</option>
            </select>
          </label>
          <div className="detail-consent-readonly">
            <span>Parent signature (read-only)</span>
            <strong>{detail.signature_name ?? "Not signed yet"}</strong>
            <small>{detail.consent_accepted ? `Consent accepted ${formatWhen(detail.consent_at)}` : "Consent not yet accepted"}</small>
            <p className="detail-hint">Signature and consent are parent-supplied only — staff can&rsquo;t set these here. Record a staff acknowledgement as an internal note below instead.</p>
          </div>
          <label><span>Internal notes</span><textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={3} /></label>
        </section>
      </div>

      <div className="detail-save-bar">
        {saveError && <span className="detail-error">{saveError}</span>}
        {saved && !saveError && <span className="detail-saved">Saved ✓</span>}
        <button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>

      <section className="detail-panel detail-panel-wide">
        <h2>Payment history</h2>
        {detail.payments.length === 0 && <p className="detail-hint">No payments recorded yet.</p>}
        {detail.payments.length > 0 && (
          <table className="detail-table">
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded by</th><th>Note</th><th /></tr></thead>
            <tbody>
              {detail.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.received_at ? payment.received_at.slice(0, 10) : ""}</td>
                  <td>{money(payment.amount_cents)}</td>
                  <td>{payment.method}</td>
                  <td>{payment.reference ?? ""}</td>
                  <td>{payment.recorded_by ?? ""}</td>
                  <td>{payment.note}</td>
                  <td><button type="button" className="detail-void-button" onClick={() => voidPayment(payment.id)}>Void</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="detail-record-payment">
          <h3>Record a payment</h3>
          <div className="detail-record-payment-fields">
            <label><span>Amount</span><div className="detail-money-input"><span>$</span><input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div></label>
            <label><span>Method</span>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="online_banking">Online banking transfer</option>
              </select>
            </label>
            <label><span>Date received</span><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
            <label><span>Reference (optional)</span><input value={payReference} onChange={(e) => setPayReference(e.target.value)} /></label>
            <label><span>Note (optional)</span><input value={payNote} onChange={(e) => setPayNote(e.target.value)} /></label>
          </div>
          {payError && <span className="detail-error">{payError}</span>}
          <button type="button" disabled={payBusy} onClick={recordPayment}>{payBusy ? "Recording…" : "Record payment"}</button>
        </div>
      </section>

      <section className="detail-panel detail-panel-wide">
        <h2>Edit history</h2>
        {detail.edits.length === 0 && <p className="detail-hint">No edits recorded yet.</p>}
        {detail.edits.length > 0 && (
          <ul className="detail-edit-log">
            {detail.edits.map((edit) => (
              <li key={edit.id}>
                <strong>{edit.changed_by}</strong> <span>{formatWhen(edit.created_at)}</span>
                <ul>
                  {Object.entries(edit.changes).map(([field, change]) => (
                    <li key={field}>{field}: {String(change.from ?? "—")} → {String(change.to ?? "—")}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
