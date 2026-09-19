"use client";

import { useState } from "react";
import type { AdminWeddingPackage } from "@/db/weddingPackages";

function money(cents: number | null) {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

type Draft = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  includes: string;
  priceDollars: string;
  priceNote: string;
  visibility: "draft" | "unlisted" | "live";
  sortOrder: number;
};

function toDraft(pkg: AdminWeddingPackage): Draft {
  return {
    slug: pkg.slug,
    name: pkg.name,
    tagline: pkg.tagline ?? "",
    description: pkg.description ?? "",
    includes: pkg.includes.join("\n"),
    priceDollars: money(pkg.priceFromCents),
    priceNote: pkg.priceNote ?? "from",
    visibility: pkg.visibility,
    sortOrder: pkg.sortOrder,
  };
}

const BLANK_DRAFT: Draft = { slug: "", name: "", tagline: "", description: "", includes: "", priceDollars: "", priceNote: "from", visibility: "draft", sortOrder: 99 };

function PackageEditor({ id, initial, onSaved }: { id: number | null; initial: Draft; onSaved: (packages: AdminWeddingPackage[]) => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/weddings/admin/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        slug: draft.slug,
        name: draft.name,
        tagline: draft.tagline,
        description: draft.description,
        includes: draft.includes.split("\n").map((s) => s.trim()).filter(Boolean),
        priceDollars: draft.priceDollars.trim() ? Number(draft.priceDollars) : null,
        priceNote: draft.priceNote,
        visibility: draft.visibility,
        sortOrder: draft.sortOrder,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Could not save."); return; }
    setSaved(true);
    if (data.packages) onSaved(data.packages);
  }

  return (
    <div className="wedding-admin-panel">
      <h2>{draft.name || "New package"}</h2>
      <div className="wedding-admin-field-grid">
        <label><span>Slug</span><input value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder="ceremony" /></label>
        <label><span>Name</span><input value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="wedding-admin-field-full"><span>Tagline</span><input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} /></label>
        <label className="wedding-admin-field-full"><span>Description</span><textarea rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
        <label className="wedding-admin-field-full"><span>What's included (one per line)</span><textarea rows={4} value={draft.includes} onChange={(e) => set("includes", e.target.value)} /></label>
        <label><span>Price (BSD, blank = ask the Wedding Desk)</span><input inputMode="decimal" value={draft.priceDollars} onChange={(e) => set("priceDollars", e.target.value)} placeholder="e.g. 450" /></label>
        <label><span>Price wording</span>
          <select value={draft.priceNote} onChange={(e) => set("priceNote", e.target.value)}>
            <option value="from">From</option>
            <option value="typical">Typical</option>
            <option value="">Exact</option>
          </select>
        </label>
        <label><span>Visibility</span>
          <select value={draft.visibility} onChange={(e) => set("visibility", e.target.value as Draft["visibility"])}>
            <option value="draft">Draft (hidden)</option>
            <option value="unlisted">Unlisted (link only)</option>
            <option value="live">Live (public)</option>
          </select>
        </label>
        <label><span>Sort order</span><input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="staff-actions">
        <button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {saved && !error && <span className="coach-manager-message">Saved ✓</span>}
      </div>
    </div>
  );
}

export function PackagesManager({ initialPackages }: { initialPackages: AdminWeddingPackage[] }) {
  const [packages, setPackages] = useState(initialPackages);
  const [adding, setAdding] = useState(false);

  return (
    <>
      {packages.map((pkg) => (
        <PackageEditor key={pkg.id} id={pkg.id} initial={toDraft(pkg)} onSaved={setPackages} />
      ))}
      {adding ? (
        <PackageEditor id={null} initial={BLANK_DRAFT} onSaved={(next) => { setPackages(next); setAdding(false); }} />
      ) : (
        <button className="secondary-button" onClick={() => setAdding(true)}>+ Add a package</button>
      )}
    </>
  );
}
