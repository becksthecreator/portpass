"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";

type Preview = {
  total: number;
  skipped: Array<{ row: number; reason: string }>;
  unmappedColumns: string[];
  byStatus: Array<{ status: string; count: number }>;
  withScore: number;
  noSection: string[];
  sample: Array<{ businessName: string; section: string | null; status: string; score: number | null }>;
};
type Outcome = { added: number; duplicates: string[]; doNotContact: string[]; failed: string[] };

// Preview, then import. A business already in Leads, or one marked "do not
// contact", is skipped, so running the import twice is safe.
export function TrackerImporter() {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
    setOutcome(null);
  }

  async function send(apply: boolean) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/leads/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, apply }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; preview?: Preview; outcome?: Outcome }) : {};
    setBusy(false);
    if (!response || !response.ok) {
      setError(data.error ?? "That didn't work.");
      return;
    }
    setPreview(data.preview ?? null);
    setOutcome(data.outcome ?? null);
  }

  return (
    <div className="admin-form leads-import">
      <label><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={load} /></label>
      <label><span>Or paste the CSV</span><textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); setOutcome(null); }} placeholder="#,Section,Subcategory,Business,…" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="leads-add-actions">
        <button type="button" className="primary-button" disabled={busy || !csv.trim()} onClick={() => send(false)}>{busy && !preview ? "Reading…" : "Preview"}</button>
        {preview && !outcome && <button type="button" className="primary-button" disabled={busy} onClick={() => send(true)}>{busy ? "Importing…" : `Import ${preview.total} businesses`}</button>}
      </div>

      {preview && (
        <div className="leads-import-preview" role="status">
          <h2>{outcome ? "Imported" : "Preview"}</h2>
          <p><strong>{preview.total}</strong> businesses found · {preview.withScore} with a lead score · {preview.byStatus.map((s) => `${s.status} ${s.count}`).join(" · ")}</p>
          {preview.unmappedColumns.length > 0 && <p className="lead-meta">Columns not used: {preview.unmappedColumns.join(", ")}.</p>}
          {preview.skipped.length > 0 && <p className="lead-meta">Skipped rows: {preview.skipped.map((s) => `row ${s.row} (${s.reason})`).join("; ")}.</p>}
          {preview.noSection.length > 0 && <p className="lead-meta">No matching section for: {preview.noSection.slice(0, 12).join(", ")}{preview.noSection.length > 12 ? ` and ${preview.noSection.length - 12} more` : ""}. They are imported without one.</p>}
          {!outcome && (
            <ul className="leads-places">
              {preview.sample.map((row) => <li key={row.businessName}><div><strong>{row.businessName}</strong><small>{[row.section ?? "No section", row.status, row.score !== null ? `score ${row.score}` : null].filter(Boolean).join(" · ")}</small></div></li>)}
            </ul>
          )}
        </div>
      )}

      {outcome && (
        <div className="leads-import-preview" role="status">
          <p><strong>{outcome.added}</strong> added.{outcome.duplicates.length > 0 ? ` ${outcome.duplicates.length} already in Leads.` : ""}{outcome.doNotContact.length > 0 ? ` ${outcome.doNotContact.length} skipped because they asked not to be contacted.` : ""}{outcome.failed.length > 0 ? ` ${outcome.failed.length} could not be saved: ${outcome.failed.slice(0, 8).join(", ")}.` : ""}</p>
          <p><Link href="/admin/leads">Open Leads</Link></p>
        </div>
      )}
    </div>
  );
}
