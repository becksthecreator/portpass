"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const blank = {
  name: "", audience: "children", programType: "term", ageMin: "", ageMax: "", dayOfWeek: "Saturday", startTime: "", endTime: "",
  location: "", capacity: "", termName: "", termStartDate: "", termEndDate: "", weeklyFee: "", termFee: "", registrationClosesAt: "",
};

// "Add a class or camp" (brief 18, D4): what people will register for,
// with its first term. A class runs weekly on one day; a camp runs every
// weekday between its dates. Who it is for decides what the registration
// form asks: an adults' class asks for no guardian or health details.
export function ProgramForm({ organizationId }: { organizationId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const camp = form.programType === "camp";
  const adults = form.audience === "adults";

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch(`/api/business/orgs/${organizationId}/programs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ageMin: Number(form.ageMin), ageMax: Number(form.ageMax), capacity: Number(form.capacity) }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not add it.");
    setForm(blank);
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button className="primary-button reg-add" type="button" onClick={() => setOpen(true)}>Add a class or camp</button>;

  return (
    <form className="reg-form" onSubmit={save}>
      <h3>Add a class or camp</h3>
      <label><span>Name *</span><input required maxLength={80} value={form.name} onChange={set("name")} placeholder="e.g. Saturday Juniors" /></label>
      <div className="reg-two">
        <label>
          <span>Who is it for? *</span>
          <select value={form.audience} onChange={set("audience")}>
            <option value="children">Children (asks for a guardian and health details)</option>
            <option value="adults">Adults (asks for neither)</option>
            <option value="mixed">Both (the person says which)</option>
          </select>
        </label>
        <label>
          <span>What is it? *</span>
          <select value={form.programType} onChange={set("programType")}>
            <option value="term">A class, weekly for a term</option>
            <option value="camp">A camp, every weekday between its dates</option>
          </select>
        </label>
      </div>
      {!adults && (
        <div className="reg-two">
          <label><span>Youngest age *</span><input required inputMode="numeric" value={form.ageMin} onChange={set("ageMin")} /></label>
          <label><span>Oldest age *</span><input required inputMode="numeric" value={form.ageMax} onChange={set("ageMax")} /></label>
        </div>
      )}
      <div className="reg-two">
        {!camp && (
          <label>
            <span>Day *</span>
            <select value={form.dayOfWeek} onChange={set("dayOfWeek")}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
          </label>
        )}
        <label><span>Places *</span><input required inputMode="numeric" value={form.capacity} onChange={set("capacity")} /></label>
      </div>
      <div className="reg-two">
        <label><span>Starts at *</span><input required type="time" value={form.startTime} onChange={set("startTime")} /></label>
        <label><span>Ends at *</span><input required type="time" value={form.endTime} onChange={set("endTime")} /></label>
      </div>
      <label><span>Where *</span><input required maxLength={120} value={form.location} onChange={set("location")} placeholder="The place, as customers know it" /></label>
      <label><span>{camp ? "Camp name" : "Term name"}</span><input maxLength={60} value={form.termName} onChange={set("termName")} placeholder={camp ? "e.g. Easter camp" : "e.g. Term 1"} /></label>
      <div className="reg-two">
        <label><span>First date *</span><input required type="date" value={form.termStartDate} onChange={set("termStartDate")} /></label>
        <label><span>Last date *</span><input required type="date" value={form.termEndDate} onChange={set("termEndDate")} /></label>
      </div>
      <div className="reg-two">
        <label><span>{camp ? "Camp fee ($) *" : "Fee for the whole term ($) *"}</span><input required inputMode="decimal" value={form.termFee} onChange={set("termFee")} /></label>
        {!camp && <label><span>Weekly fee ($)</span><input inputMode="decimal" value={form.weeklyFee} onChange={set("weeklyFee")} placeholder="Blank: paid by the term only" /></label>}
      </div>
      <label><span>Registration closes (optional)</span><input type="datetime-local" value={form.registrationClosesAt} onChange={set("registrationClosesAt")} /><small>Nassau time. Blank: open until it ends.</small></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="auth-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding…" : "Add it"}</button>
        <button className="auth-text-button" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

// Open or close one programme for registration.
export function ProgramToggle({ organizationId, programId, active }: { organizationId: number; programId: number; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch(`/api/business/orgs/${organizationId}/programs`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId, active: !active }) }).catch(() => undefined);
    setBusy(false);
    router.refresh();
  }
  return <button className="auth-text-button" type="button" disabled={busy} onClick={() => void toggle()}>{active ? "Close registration" : "Open registration"}</button>;
}
