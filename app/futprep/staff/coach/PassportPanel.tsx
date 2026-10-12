"use client";

import { useState, type FormEvent } from "react";
import type { StaffPassport } from "@/db/passports";

const SCORES = [1, 2, 3, 4, 5];

// The Progress Passport for one child on the roster (brief 31, D), opened
// on tap so the roster stays quick. Each tap on a score saves it. Start
// marks in week 1, end marks in the last two weeks (the desk can put a
// mark right any time); a note, a clip link when the family said yes to
// photos and videos, a next step, then Share with the family.
export function PassportPanel({ registrationId, childName }: { registrationId: number; childName: string }) {
  const [passport, setPassport] = useState<StaffPassport | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (passport || busy) return;
    setBusy(true);
    const response = await fetch(`/api/futprep/staff/passports?registrationId=${registrationId}`).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { passport?: StaffPassport; error?: string }) : { error: "No connection. Try again." };
    setBusy(false);
    if (!response?.ok || !data.passport) return setError(data.error ?? "Could not open the passport.");
    setPassport(data.passport);
  }

  async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
    setError("");
    setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId, ...body }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : { error: "No connection. Try again." };
    if (!response?.ok) {
      setError(data.error ?? "Could not save.");
      return false;
    }
    return true;
  }

  async function mark(skillId: number, phase: "start" | "end", score: number) {
    if (!passport) return;
    const before = passport;
    setPassport({ ...passport, marks: [...passport.marks.filter((m) => m.skillId !== skillId), { skillId, start: phase === "start" ? score : passport.marks.find((m) => m.skillId === skillId)?.start ?? null, end: phase === "end" ? score : passport.marks.find((m) => m.skillId === skillId)?.end ?? null }] });
    if (!(await post("/api/futprep/staff/passports", { skillId, phase, score }))) setPassport(before);
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStep = String(form.get("nextStep") ?? "");
    if (await post("/api/futprep/staff/passports/note", { note: String(form.get("note") ?? ""), clipUrl: passport?.clipAllowed ? String(form.get("clipUrl") ?? "") : null, nextStepOfferingId: nextStep ? Number(nextStep) : null })) setMessage("Note saved.");
  }

  async function share() {
    if (!confirm(`Share ${childName}'s passport with the family? It can't be changed afterwards.`)) return;
    if (await post("/api/futprep/staff/passports/share", {})) {
      setPassport(passport ? { ...passport, status: "shared", canShare: false } : passport);
      setMessage("Shared. The family sees it when they look up their registration.");
    }
  }

  const shared = passport?.status === "shared";
  const scoreRow = (skillId: number, phase: "start" | "end", open: boolean) => {
    const current = passport?.marks.find((m) => m.skillId === skillId)?.[phase] ?? null;
    return (
      <div className="passport-scores" role="group" aria-label={phase === "start" ? "Start of term" : "End of term"}>
        {SCORES.map((score) => (
          <button key={score} type="button" className={current === score ? "is-active" : ""} disabled={shared || !open} aria-pressed={current === score} onClick={() => mark(skillId, phase, score)}>{score}</button>
        ))}
      </div>
    );
  };

  return (
    <details className="passport-panel" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) void load(); }}>
      <summary>Progress Passport</summary>
      {busy && <p className="passport-hint">Opening…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message" role="status">{message}</p>}
      {passport && (
        <div className="passport-body">
          <p className="passport-hint">
            {shared ? "Shared with the family." : passport.windows.start ? "Start marks are open this week." : passport.windows.end ? "End marks are open: the last two weeks of term." : "Marks open in the first week of term and again in the last two weeks."} 1 is just starting, 5 is confident.
          </p>
          {passport.skills.map((skill) => (
            <div className="passport-skill" key={skill.id}>
              <strong>{skill.name}</strong>
              <span className="passport-phase">Start</span>
              {scoreRow(skill.id, "start", passport.windows.start)}
              <span className="passport-phase">End</span>
              {scoreRow(skill.id, "end", passport.windows.end)}
            </div>
          ))}
          <form className="passport-note team-login-form" onSubmit={saveNote}>
            <label><span>Note for the family (500 characters)</span><textarea name="note" rows={3} maxLength={500} defaultValue={passport.note} disabled={shared} /></label>
            <p className="passport-hint">No health or medical details here: the desk keeps those.</p>
            {passport.clipAllowed && <label><span>Clip (YouTube or Google Drive link)</span><input name="clipUrl" type="url" inputMode="url" defaultValue={passport.clipUrl ?? ""} placeholder="https://youtu.be/…" disabled={shared} /></label>}
            <label><span>Next step</span>
              <select name="nextStep" defaultValue={passport.nextStepOfferingId ?? ""} disabled={shared}>
                <option value="">None yet</option>
                {passport.nextSteps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            {!shared && <button type="submit">Save note</button>}
          </form>
          {!shared && <button type="button" className="passport-share" disabled={!passport.canShare} onClick={share}>{passport.canShare ? "Share with the family" : "Share once every skill has an end mark"}</button>}
        </div>
      )}
    </details>
  );
}
