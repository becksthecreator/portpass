"use client";

import { useState } from "react";
import type { ImportPreview } from "@/db/teamsnapImport";

const STATUS_LABEL: Record<ImportPreview["rows"][number]["status"], string> = {
  fill: "Will fill",
  nothing_new: "Nothing new",
  no_match: "No registration with this name",
  ambiguous: "Matches two children: do this one by hand",
  not_pending: "Already completed by the parent",
};

export function TeamsnapImporter({ classes }: { classes: Array<{ programId: number; termId: number; label: string }> }) {
  const [choice, setChoice] = useState(classes[0] ? `${classes[0].programId}:${classes[0].termId}` : "");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function send(apply: boolean) {
    const [programId, termId] = choice.split(":").map(Number);
    setBusy(true);
    setError("");
    setDone("");
    const response = await fetch("/api/futprep/staff/teamsnap-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, termId, csv, apply }),
    }).catch(() => null);
    setBusy(false);
    const data = response ? ((await response.json().catch(() => ({}))) as ImportPreview & { error?: string; updated?: number }) : null;
    if (!response || !response.ok || !data) return setError(data?.error ?? "Could not read the import.");
    if (apply) {
      setPreview(null);
      setDone(`Filled in details for ${data.updated} ${data.updated === 1 ? "child" : "children"}. Nothing was sent to parents; each family still confirms through their completion link.`);
    } else {
      setPreview(data);
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
  }

  const toFill = preview?.counts.fill ?? 0;

  return (
    <div className="teamsnap-import">
      <div className="team-admin-form">
        <label><span>Class</span>
          <select value={choice} onChange={(e) => { setChoice(e.target.value); setPreview(null); }}>
            {classes.map((c) => <option key={`${c.programId}:${c.termId}`} value={`${c.programId}:${c.termId}`}>{c.label}</option>)}
          </select>
        </label>
        <label><span>TeamSnap roster (CSV file)</span><input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} /></label>
        <label><span>…or paste it</span><textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder="First Name,Last Name,Birthdate,…" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {done && <p className="coach-manager-message" role="status">{done}</p>}
        <button className="primary-button" type="button" disabled={busy || !csv.trim() || !choice} onClick={() => send(false)}>{busy && !preview ? "Reading…" : "Preview →"}</button>
      </div>

      {preview && (
        <section className="pay-section" aria-labelledby="teamsnap-preview">
          <div className="pay-section-head"><h2 id="teamsnap-preview">Preview</h2></div>
          <p className="pay-note">
            {preview.rows.length} rows · {toFill} to fill · {preview.counts.nothing_new} nothing new · {preview.counts.no_match} not found · {preview.counts.ambiguous} unclear · {preview.counts.not_pending} already completed.
            {preview.unmapped.length > 0 && ` Ignored columns: ${preview.unmapped.join(", ")}.`}
          </p>
          <div className="pay-cards">
            {preview.rows.map((row) => (
              <article className="pay-card" key={row.row}>
                <div className="pay-card-head"><strong>{row.childName}</strong><span>row {row.row}{row.referenceCode ? ` · ${row.referenceCode}` : ""}</span></div>
                <p className={`teamsnap-status teamsnap-${row.status}`}>{STATUS_LABEL[row.status]}</p>
                {row.fields.length > 0 && <p className="pay-note">Fills: {row.fields.join(", ")}.</p>}
              </article>
            ))}
          </div>
          <button className="primary-button" type="button" disabled={busy || toFill === 0} onClick={() => send(true)}>
            {busy ? "Saving…" : toFill === 0 ? "Nothing to fill" : `Fill in details for ${toFill} ${toFill === 1 ? "child" : "children"} →`}
          </button>
        </section>
      )}
    </div>
  );
}
