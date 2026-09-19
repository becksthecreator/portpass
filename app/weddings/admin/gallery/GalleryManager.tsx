"use client";

import { useState } from "react";
import type { AdminWeddingGalleryImage } from "@/db/weddingSite";

type Draft = {
  imageUrl: string;
  caption: string;
  photographerName: string;
  photographerUrl: string;
  isHero: boolean;
  visibility: "draft" | "live";
  sortOrder: number;
};

function toDraft(image: AdminWeddingGalleryImage): Draft {
  return {
    imageUrl: image.imageUrl,
    caption: image.caption ?? "",
    photographerName: image.photographerName ?? "",
    photographerUrl: image.photographerUrl ?? "",
    isHero: image.isHero,
    visibility: image.visibility,
    sortOrder: image.sortOrder,
  };
}

const BLANK_DRAFT: Draft = { imageUrl: "", caption: "", photographerName: "", photographerUrl: "", isHero: false, visibility: "draft", sortOrder: 99 };

function ImageEditor({ id, initial, onSaved, onDeleted }: { id: number | null; initial: Draft; onSaved: (images: AdminWeddingGalleryImage[]) => void; onDeleted?: () => void }) {
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
    const response = await fetch("/api/weddings/admin/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...draft }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Could not save."); return; }
    setSaved(true);
    if (data.images) onSaved(data.images);
  }

  async function remove() {
    if (id === null) return;
    if (!window.confirm("Remove this photo from the gallery?")) return;
    setBusy(true);
    const response = await fetch("/api/weddings/admin/gallery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok && data.images) { onSaved(data.images); onDeleted?.(); }
  }

  return (
    <div className="wedding-admin-panel">
      {draft.imageUrl && <img src={draft.imageUrl} alt="" style={{ maxWidth: 220, maxHeight: 160, objectFit: "cover", marginBottom: 12 }} />}
      <div className="wedding-admin-field-grid">
        <label className="wedding-admin-field-full"><span>Image URL</span><input value={draft.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" /></label>
        <label className="wedding-admin-field-full"><span>Caption</span><input value={draft.caption} onChange={(e) => set("caption", e.target.value)} /></label>
        <label><span>Photographer name</span><input value={draft.photographerName} onChange={(e) => set("photographerName", e.target.value)} /></label>
        <label><span>Photographer link (optional)</span><input value={draft.photographerUrl} onChange={(e) => set("photographerUrl", e.target.value)} placeholder="https://…" /></label>
        <label><span>Hero image</span>
          <select value={draft.isHero ? "yes" : "no"} onChange={(e) => set("isHero", e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label><span>Visibility</span>
          <select value={draft.visibility} onChange={(e) => set("visibility", e.target.value as Draft["visibility"])}>
            <option value="draft">Draft (rights not confirmed / hidden)</option>
            <option value="live">Live (public)</option>
          </select>
        </label>
        <label><span>Sort order</span><input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="staff-actions">
        <button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {id !== null && <button className="danger-action" disabled={busy} onClick={remove}>Remove</button>}
        {saved && !error && <span className="coach-manager-message">Saved ✓</span>}
      </div>
    </div>
  );
}

export function GalleryManager({ initialImages }: { initialImages: AdminWeddingGalleryImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [adding, setAdding] = useState(false);

  return (
    <>
      {images.map((image) => (
        <ImageEditor key={image.id} id={image.id} initial={toDraft(image)} onSaved={setImages} />
      ))}
      {adding ? (
        <ImageEditor id={null} initial={BLANK_DRAFT} onSaved={(next) => { setImages(next); setAdding(false); }} />
      ) : (
        <button className="secondary-button" onClick={() => setAdding(true)}>+ Add a photo</button>
      )}
    </>
  );
}
