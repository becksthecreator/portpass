"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { AdminLink } from "@/db/adminLinks";

type Draft = { title: string; url: string; description: string; sort: string };

const draftOf = (l: AdminLink): Draft => ({ title: l.title, url: l.url ?? "", description: l.description ?? "", sort: String(l.sort) });
const EMPTY: Draft = { title: "", url: "", description: "", sort: "0" };

export function ToolsManager({ links }: { links: AdminLink[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState<Draft>(EMPTY);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "That didn't save.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const payload = (d: Draft) => ({ title: d.title.trim(), url: d.url.trim() || null, description: d.description.trim() || null, sort: Number(d.sort) || 0 });

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await call("/api/admin/tools", "POST", payload(adding))) setAdding(EMPTY);
  }

  async function save(id: number) {
    if (await call(`/api/admin/tools/${id}`, "PATCH", payload(draft))) setEditing(null);
  }

  return (
    <div className="admin-tools">
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul className="admin-tools-list">
        {links.map((link) => (
          <li key={link.id} className="admin-tool">
            {editing === link.id ? (
              <div className="admin-price-grid">
                <label>Title<input className="admin-inline-input" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
                <label>Link<input className="admin-inline-input" value={draft.url} placeholder="https://claude.ai/…" maxLength={500} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
                <label>Order<input className="admin-inline-input" type="number" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })} /></label>
                <label className="admin-price-wide">Description<input className="admin-inline-input" value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
                <div className="admin-price-actions admin-price-wide">
                  <button className="admin-mini is-primary" type="button" disabled={busy} onClick={() => void save(link.id)}>Save</button>
                  <button className="admin-mini" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="admin-tool-main">
                  {link.url ? (
                    <a className="admin-tool-title" href={link.url} target="_blank" rel="noopener noreferrer">{link.title} ↗</a>
                  ) : (
                    <span className="admin-tool-title is-missing">{link.title} <small>· no link yet</small></span>
                  )}
                  {link.description && <p>{link.description}</p>}
                </div>
                <div className="admin-tool-actions">
                  <button className="admin-mini" type="button" disabled={busy} onClick={() => { setEditing(link.id); setDraft(draftOf(link)); }}>Edit</button>
                  <button className="admin-mini" type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove "${link.title}"?`)) void call(`/api/admin/tools/${link.id}`, "DELETE"); }}>Remove</button>
                </div>
              </>
            )}
          </li>
        ))}
        {links.length === 0 && <li className="admin-empty">No tools yet.</li>}
      </ul>

      <form className="admin-form" onSubmit={add}>
        <h2 className="admin-prices-h2">Add a tool</h2>
        <div className="admin-price-grid">
          <label>Title<input className="admin-inline-input" required maxLength={80} value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} /></label>
          <label>Link<input className="admin-inline-input" placeholder="https://…" maxLength={500} value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} /></label>
          <label>Order<input className="admin-inline-input" type="number" value={adding.sort} onChange={(e) => setAdding({ ...adding, sort: e.target.value })} /></label>
          <label className="admin-price-wide">Description<input className="admin-inline-input" maxLength={200} value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} /></label>
        </div>
        <div className="admin-price-actions"><button className="primary-button" type="submit" disabled={busy}>Add tool</button></div>
      </form>
    </div>
  );
}
