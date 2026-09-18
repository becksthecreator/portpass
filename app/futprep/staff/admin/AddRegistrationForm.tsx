"use client";

import { FormEvent, useState } from "react";
import { FUTPREP_PROGRAMS } from "../../config";

// Fast-path for migrating already-enrolled children (real kids attending
// real Saturday sessions with zero registration rows). Deliberately not the
// parent-facing multi-step wizard: no medical/allergy fields (collected from
// the family afterward), emergency contact/pickup default to the parent
// when left blank, and a staff acknowledgement replaces the parent's own
// electronic signature. A successful save reloads the page so the list and
// summary counts below pick up the new row from the server.
export function AddRegistrationForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsAgeOverride, setNeedsAgeOverride] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/futprep/staff/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; needsAgeOverride?: boolean; registration?: unknown };
      if (!response.ok) {
        if (data.needsAgeOverride) {
          setNeedsAgeOverride(true);
          setPendingPayload(payload);
          setError("This child's age doesn't match the class boundary. Confirm this is correct to save anyway.");
          return;
        }
        throw new Error(data.error ?? "Could not save this registration.");
      }
      setMessage("Added. Ready for the next child.");
      setNeedsAgeOverride(false);
      setPendingPayload(null);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this registration.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      parentName: form.get("parentName"),
      parentEmail: form.get("parentEmail"),
      parentPhone: form.get("parentPhone"),
      relationship: form.get("relationship"),
      childName: form.get("childName"),
      childDob: form.get("childDob"),
      gender: form.get("gender"),
      emergencyContactName: form.get("emergencyContactName"),
      emergencyContactPhone: form.get("emergencyContactPhone"),
      authorizedPickup: form.get("authorizedPickup"),
      additionalNotes: form.get("additionalNotes"),
      programSlug: form.get("programSlug"),
      paymentFrequency: form.get("paymentFrequency"),
      paymentMethod: form.get("paymentMethod"),
      photoConsent: form.get("photoConsent"),
      staffAcknowledged: form.get("staffAcknowledged") === "on",
    };
    await send(payload);
  }

  async function confirmAgeOverride() {
    if (!pendingPayload) return;
    await send({ ...pendingPayload, ageOverrideConfirmed: true });
  }

  return (
    <form className="team-admin-form" onSubmit={submit}>
      <span className="section-kicker">Migrating an already-enrolled child</span>
      <h2>Add a registration directly.</h2>
      <p>For children already attending Futprep before this system existed. Medical, allergy and special-needs detail isn&rsquo;t collected here — follow up with the family for that.</p>

      <div className="team-form-two">
        <label><span>Child full name *</span><input name="childName" required /></label>
        <label><span>Child date of birth *</span><input name="childDob" type="date" required /></label>
      </div>

      <div className="team-form-two">
        <label><span>Class *</span>
          <select name="programSlug" defaultValue={FUTPREP_PROGRAMS[0].slug} required>
            {FUTPREP_PROGRAMS.map((program) => <option key={program.slug} value={program.slug}>{program.name} (ages {program.ageMin}–{program.ageMax})</option>)}
          </select>
        </label>
        <label><span>Gender *</span>
          <select name="gender" defaultValue="" required>
            <option value="" disabled>Choose</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
      </div>

      <div className="team-form-two">
        <label><span>Parent / guardian name *</span><input name="parentName" required /></label>
        <label><span>Relationship</span><input name="relationship" placeholder="Parent" /></label>
      </div>

      <div className="team-form-two">
        <label><span>Parent phone *</span><input name="parentPhone" type="tel" required /></label>
        <label><span>Parent email *</span><input name="parentEmail" type="email" required /></label>
      </div>

      <div className="team-form-two">
        <label><span>Emergency contact name</span><input name="emergencyContactName" placeholder="Defaults to parent" /></label>
        <label><span>Emergency contact phone</span><input name="emergencyContactPhone" placeholder="Defaults to parent" /></label>
      </div>

      <label><span>Authorized pickup</span><input name="authorizedPickup" placeholder="Defaults to parent" /></label>

      <div className="team-form-two">
        <label><span>Payment plan *</span>
          <select name="paymentFrequency" defaultValue="weekly" required>
            <option value="weekly">Weekly</option>
            <option value="term">Full term</option>
          </select>
        </label>
        <label><span>Payment method *</span>
          <select name="paymentMethod" defaultValue="cash" required>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="online_banking">Online banking transfer</option>
          </select>
        </label>
      </div>

      <div>
        <span>Photo / video permission *</span>
        <label className="inline-choice"><input name="photoConsent" type="radio" value="yes" required /> Yes, permitted</label>
        <label className="inline-choice"><input name="photoConsent" type="radio" value="no" required /> No, not permitted</label>
      </div>

      <label><span>Notes</span><textarea name="additionalNotes" rows={2} /></label>

      <label className="inline-choice">
        <input name="staffAcknowledged" type="checkbox" required />
        I confirm this family has already agreed to participate in Futprep and this registration is accurate to the best of my knowledge.
      </label>

      {needsAgeOverride && (
        <button type="button" className="secondary-button" disabled={busy} onClick={confirmAgeOverride}>
          Confirm age is correct anyway →
        </button>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message">{message}</p>}

      <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Add registration →"}</button>
    </form>
  );
}
