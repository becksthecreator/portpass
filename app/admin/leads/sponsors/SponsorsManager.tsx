"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SPONSOR_STATUS_LABEL, SPONSOR_STATUSES, type Sponsor, type SponsorStatus } from "@/lib/sponsors";

type Draft = { name: string; item: string; value: string; whatWeGive: string; status: SponsorStatus; notes: string };

const BLANK: Draft = { name: "", item: "", value: "", whatWeGive: "", status: "talking", notes: "" };

const draftOf = (sponsor: Sponsor): Draft => ({ name: sponsor.name, item: sponsor.item, value: sponsor.valueCents === null ? "" : (sponsor.valueCents / 100).toFixed(2).replace(/\.00$/, ""), whatWeGive: sponsor.whatWeGive, status: sponsor.status, notes: sponsor.notes });

// "$1,200" or "1200.50" as cents; "" as no value; anything else is refused.
function centsOf(value: string): number | null | undefined {
  const typed = value.replace(/[$,\s]/g, "");
  if (!typed) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(typed)) return undefined;
  return Math.round(Number(typed) * 100);
}

const money = (cents: number | null) => (cents === null ? "—" : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`);

function SponsorForm({ draft, setDraft, onSubmit, onCancel, busy, submitLabel, error }: { draft: Draft; setDraft: (draft: Draft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel?: () => void; busy: boolean; submitLabel: string; error: string }) {
  return (
    <form className="admin-content-form" onSubmit={onSubmit}>
      <label><span>Sponsor</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} required placeholder="Island Print Shop" /></label>
      <label><span>What they give</span><input value={draft.item} onChange={(event) => setDraft({ ...draft, item: event.target.value })} maxLength={200} placeholder="Conference banner" /></label>
      <label><span>What it is worth, in dollars (optional)</span><input value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} inputMode="decimal" maxLength={12} placeholder="250" /></label>
      <label><span>What we give</span><input value={draft.whatWeGive} onChange={(event) => setDraft({ ...draft, whatWeGive: event.target.value })} maxLength={300} placeholder="Two free months and a thank-you on Instagram" /></label>
      <label><span>Where it stands</span>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as SponsorStatus })}>
          {SPONSOR_STATUSES.map((status) => <option key={status} value={status}>{SPONSOR_STATUS_LABEL[status]}</option>)}
        </select>
      </label>
      <label><span>Notes</span><input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} maxLength={600} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-action is-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" className="admin-action" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}

// The Sponsors tab (brief 08, 1.8): what each sponsor gives, what it is
// worth, what PortPass gives back, and where it stands.
export function SponsorsManager({ sponsors }: { sponsors: Sponsor[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState<Draft>(BLANK);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  // The message is shown beside whatever was being done: the add form, the
  // row being edited, or (for Remove) above the list.
  const [error, setError] = useState("");
  const [errorAt, setErrorAt] = useState<"add" | "edit" | "list">("list");

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    setErrorAt(method === "POST" ? "add" : method === "PATCH" ? "edit" : "list");
    const response = await fetch("/api/admin/sponsors", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      router.refresh();
      return true;
    }
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setError(data.error ?? "Could not finish saving. Check the list before trying again.");
    // A failure part-way may still have changed the list: show what is stored.
    if (!response || response.status >= 500) router.refresh();
    return false;
  }

  function payload(draft: Draft, at: "add" | "edit"): Record<string, unknown> | null {
    const valueCents = centsOf(draft.value);
    if (valueCents === undefined) {
      setErrorAt(at);
      setError("The value is an amount in dollars, like 250 or 1,200.50.");
      return null;
    }
    return { name: draft.name, item: draft.item, valueCents, whatWeGive: draft.whatWeGive, status: draft.status, notes: draft.notes };
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sponsor = payload(adding, "add");
    if (sponsor && (await send("POST", { sponsor }))) setAdding(BLANK);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sponsor = payload(editing, "edit");
    if (sponsor && editingId && (await send("PATCH", { id: editingId, sponsor }))) setEditingId(null);
  }

  async function remove(sponsor: Sponsor) {
    if (!window.confirm(`Remove ${sponsor.name} from the sponsors list?`)) return;
    await send("DELETE", { id: sponsor.id });
  }

  const agreed = sponsors.filter((sponsor) => sponsor.status === "agreed" || sponsor.status === "delivered");
  const agreedCents = agreed.reduce((sum, sponsor) => sum + (sponsor.valueCents ?? 0), 0);

  return (
    <>
      {error && errorAt === "list" && <p className="form-error" role="alert">{error}</p>}
      {sponsors.length === 0 ? (
        <p className="admin-empty">No sponsors yet. Add the first one below.</p>
      ) : (
        <>
          <p className="admin-form-note">{sponsors.length} on the list · {agreed.length} agreed or delivered, worth {money(agreedCents)}</p>
          <table className="admin-table">
            <thead><tr><th>Sponsor</th><th>What they give</th><th>Worth</th><th>What we give</th><th>Status</th><th>Change</th></tr></thead>
            <tbody>
              {sponsors.map((sponsor) => (
                editingId === sponsor.id ? (
                  <tr key={sponsor.id}><td colSpan={6}><SponsorForm draft={editing} setDraft={setEditing} onSubmit={save} onCancel={() => setEditingId(null)} busy={busy} submitLabel="Save" error={errorAt === "edit" ? error : ""} /></td></tr>
                ) : (
                  <tr key={sponsor.id}>
                    <td data-label="Sponsor"><strong>{sponsor.name}</strong>{sponsor.notes ? <><br /><small>{sponsor.notes}</small></> : null}</td>
                    <td data-label="What they give">{sponsor.item || "—"}</td>
                    <td data-label="Worth">{money(sponsor.valueCents)}</td>
                    <td data-label="What we give">{sponsor.whatWeGive || "—"}</td>
                    <td data-label="Status"><span className={`admin-pill sponsor-${sponsor.status}`}>{SPONSOR_STATUS_LABEL[sponsor.status]}</span></td>
                    <td data-label="Change">
                      <span className="admin-row-actions">
                        <button type="button" className="admin-action" onClick={() => { setEditingId(sponsor.id); setEditing(draftOf(sponsor)); setError(""); }} disabled={busy}>Edit</button>
                        <button type="button" className="admin-action is-danger" onClick={() => remove(sponsor)} disabled={busy}>Remove</button>
                      </span>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </>
      )}

      <section className="admin-group admin-sponsor-add" aria-labelledby="sponsor-add">
        <h2 id="sponsor-add">Add a sponsor</h2>
        <SponsorForm draft={adding} setDraft={setAdding} onSubmit={add} busy={busy} submitLabel="Add sponsor" error={errorAt === "add" ? error : ""} />
      </section>
    </>
  );
}
