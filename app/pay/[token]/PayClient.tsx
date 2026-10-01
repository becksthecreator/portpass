"use client";

import { useState, type FormEvent } from "react";

// The few interactive pieces of the customer's page: copy the reference,
// "I've paid", print the receipt.

export function CopyReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className="paypage-btn is-small" onClick={copy} aria-label={`Copy the reference ${value}`}>
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

// "I've paid": tells the business, with an optional note. It does not mark
// the request paid; the business confirms once it has checked.
export function IvePaid({ token, businessName, alreadySaid }: { token: string; businessName: string; alreadySaid: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadySaid);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch(`/api/pay/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Something went wrong. Try again.");
    setDone(true);
    setOpen(false);
  }

  if (done && !open) {
    return (
      <div className="paypage-said">
        <p className="paypage-thanks" role="status">Thanks. We&rsquo;ve told {businessName} you&rsquo;ve paid. They&rsquo;ll check and confirm, and this page will then say Paid with your receipt.</p>
        <button type="button" className="paypage-btn is-small" onClick={() => setOpen(true)}>Add another note</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="paypage-btn is-solid" onClick={() => setOpen(true)}>
        I&rsquo;ve paid
      </button>
    );
  }

  return (
    <form className="paypage-said" onSubmit={submit}>
      <label>
        <span>A note for {businessName} (optional)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Sent by transfer, ref 1234" />
      </label>
      {error && <p className="paypage-error" role="alert">{error}</p>}
      <div className="paypage-actions">
        <button type="submit" className="paypage-btn is-solid" disabled={busy}>{busy ? "Sending…" : `Tell ${businessName} I've paid`}</button>
        <button type="button" className="paypage-btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="paypage-btn is-solid" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
