"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BankDetails } from "@/lib/billing";

// PortPass's own bank details, printed on every invoice under "How to
// pay". Until all four are filled in, no invoice can be sent.
export function BankDetailsForm({ initial }: { initial: BankDetails }) {
  const router = useRouter();
  const [bank, setBank] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    const response = await fetch("/api/admin/billing/bank", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bank) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { complete?: boolean; error?: string }) : {};
    setBusy(false);
    if (!response || !response.ok) return setError(data.error ?? "Could not finish saving. Reload to see what is stored.");
    setDone(data.complete ? "Saved. Invoices can be sent." : "Saved. Fill in all four before an invoice can be sent.");
    router.refresh();
  }

  return (
    <form className="admin-content-form" onSubmit={save}>
      <label><span>Bank</span><input value={bank.bank} onChange={(event) => setBank({ ...bank, bank: event.target.value })} maxLength={80} /></label>
      <label><span>Account name</span><input value={bank.accountName} onChange={(event) => setBank({ ...bank, accountName: event.target.value })} maxLength={120} placeholder="PortPass Bahamas Technologies" /></label>
      <label><span>Account number</span><input value={bank.accountNumber} onChange={(event) => setBank({ ...bank, accountNumber: event.target.value })} maxLength={40} inputMode="numeric" autoComplete="off" /></label>
      <label><span>Branch or transit</span><input value={bank.branch} onChange={(event) => setBank({ ...bank, branch: event.target.value })} maxLength={80} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
      <div className="admin-form-actions"><button type="submit" className="admin-action is-primary" disabled={busy}>{busy ? "Saving…" : "Save the bank details"}</button></div>
    </form>
  );
}
