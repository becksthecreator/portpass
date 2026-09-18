"use client";

import { FormEvent, useState } from "react";
import { FUTPREP_PROGRAMS } from "../../config";

function completionMessage(childName: string, code: string, origin: string) {
  return [
    `Hi! We've started ${childName}'s Futprep registration.`,
    `Please finish it here: ${origin}/futprep/my/${code}/complete`,
    "It only takes a couple of minutes — date of birth, emergency contact, and a few medical questions.",
  ].join("\n");
}

// Fast-path for a child already attending Futprep (real kids at real
// Saturday sessions with zero registration rows). Staff enter only a name
// and a class — everything a parent would normally supply (DOB, emergency
// contact, medical info, consent, signature) is left genuinely unset, not
// defaulted or blanked, so nobody downstream mistakes "not yet asked" for
// "no allergies". The parent finishes it at /futprep/my/[code]/complete.
export function AddRegistrationForm() {
  const [error, setError] = useState("");
  const [added, setAdded] = useState<{ childName: string; referenceCode: string; whatsappHref: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setError("");
    setAdded(null);
    const form = new FormData(formEl);
    const childName = String(form.get("childName") ?? "").trim();
    const parentPhone = String(form.get("parentPhone") ?? "").trim();
    const payload = {
      childName,
      programSlug: form.get("programSlug"),
      parentName: form.get("parentName"),
      parentPhone,
      parentEmail: form.get("parentEmail"),
    };
    setBusy(true);
    try {
      const response = await fetch("/api/futprep/staff/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; referenceCode?: string };
      if (!response.ok || !data.referenceCode) throw new Error(data.error ?? "Could not add this child.");
      // wa.me needs the parent's own number here (staff messaging the
      // family), not Futprep's business line.
      const whatsappHref = parentPhone
        ? `https://wa.me/${parentPhone.replace(/\D/g, "")}?text=${encodeURIComponent(completionMessage(childName, data.referenceCode, window.location.origin))}`
        : null;
      setAdded({ childName, referenceCode: data.referenceCode, whatsappHref });
      formEl.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this child.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="team-admin-form" onSubmit={submit}>
      <span className="section-kicker">Migrating an already-enrolled child</span>
      <h2>Add a child.</h2>
      <p>Just the name and class — the parent fills in the rest (date of birth, emergency contact, medical info, consent) at their own link. Nothing here is assumed or defaulted.</p>

      <div className="team-form-two">
        <label><span>Child full name *</span><input name="childName" required /></label>
        <label><span>Class *</span>
          <select name="programSlug" defaultValue={FUTPREP_PROGRAMS[0].slug} required>
            {FUTPREP_PROGRAMS.map((program) => <option key={program.slug} value={program.slug}>{program.name} (ages {program.ageMin}–{program.ageMax})</option>)}
          </select>
        </label>
      </div>

      <div className="team-form-two">
        <label><span>Parent / guardian name <small>(optional)</small></span><input name="parentName" /></label>
        <label><span>Parent phone <small>(optional)</small></span><input name="parentPhone" type="tel" placeholder="For the one-tap WhatsApp link below" /></label>
      </div>

      <label><span>Parent email <small>(optional)</small></span><input name="parentEmail" type="email" /></label>

      {error && <p className="form-error" role="alert">{error}</p>}
      {added && (
        <div className="coach-manager-message">
          <p>{added.childName} added — reference {added.referenceCode}, pending details.</p>
          {added.whatsappHref ? (
            <a className="secondary-button" href={added.whatsappHref} target="_blank" rel="noopener noreferrer">Send completion link on WhatsApp →</a>
          ) : (
            <p>No parent phone on file — share this link with the family directly: <code>/futprep/my/{added.referenceCode}/complete</code></p>
          )}
        </div>
      )}

      <button className="primary-button" disabled={busy}>{busy ? "Adding…" : "Add child →"}</button>
    </form>
  );
}
