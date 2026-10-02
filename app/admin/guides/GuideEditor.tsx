"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { publishProblem, WRITER_NOTE } from "@/lib/guides";

type Listing = { organizationId: number; note: string };
type Draft = { id: number; slug: string; title: string; description: string; body: string; status: "draft" | "published"; publishedAt: string | null; listings: Listing[] };

// Writing a guide: the words (with ## headings, - lists and [links](/path)),
// the businesses it sends readers to, and publishing when it is ready.
export function GuideEditor({ guide, businesses }: { guide: Draft | null; businesses: Array<{ id: number; name: string }> }) {
  const router = useRouter();
  const [slug, setSlug] = useState(guide?.slug ?? "");
  const [title, setTitle] = useState(guide?.title ?? "");
  const [description, setDescription] = useState(guide?.description ?? "");
  const [body, setBody] = useState(guide?.body ?? "");
  const [listings, setListings] = useState<Listing[]>(guide?.listings ?? []);
  const [adding, setAdding] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const nameOf = (id: number) => businesses.find((business) => business.id === id)?.name ?? "A business that isn't live now";
  const notesLeft = (body.match(new RegExp(WRITER_NOTE.source, "g")) ?? []).length;
  const problem = publishProblem({ title, description, body }, listings.length);

  async function send(url: string, method: string, payload: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError("");
    setDone("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as Record<string, unknown>) : {};
    setBusy(false);
    if (!response || !response.ok) {
      setError(typeof data.error === "string" ? data.error : "That didn't save. Try again.");
      return null;
    }
    return data;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { slug, title, description, body, listings };
    if (!guide) {
      const data = await send("/api/admin/guides", "POST", payload);
      if (data && typeof data.id === "number") router.push(`/admin/guides/${data.id}`);
      return;
    }
    if (await send(`/api/admin/guides/${guide.id}`, "PUT", payload)) {
      setDone("Saved.");
      router.refresh();
    }
  }

  async function setStatus(action: "publish" | "unpublish") {
    if (!guide) return;
    if (action === "unpublish" && !confirm("Take this guide off the site? It stays here as a draft.")) return;
    if (await send(`/api/admin/guides/${guide.id}`, "POST", { action })) {
      setDone(action === "publish" ? "Published. It is live at /guides/" + guide.slug : "Taken off the site. It is a draft again.");
      router.refresh();
    }
  }

  const move = (index: number, by: number) => setListings((current) => {
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item);
    return next;
  });

  return (
    <form className="admin-content-form guide-editor" onSubmit={save}>
      <label><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={90} required /></label>
      <label><span>Address: portpassbahamas.com/guides/…</span><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={80} required pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={Boolean(guide?.publishedAt)} />{guide?.publishedAt ? <small>Fixed once published, so links to it keep working.</small> : null}</label>
      <label><span>Description (what Google shows under the title, about 150 characters)</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={170} /><small>{description.length}/155</small></label>
      <label>
        <span>The guide</span>
        <textarea rows={22} value={body} onChange={(e) => setBody(e.target.value)} maxLength={30000} />
        <small>Leave a blank line between paragraphs. <code>## </code> starts a heading, <code>- </code> a list item. Link with <code>[words](/sports-fitness)</code> or <code>[words](https://…)</code>. {notesLeft > 0 ? `${notesLeft} [Antonio: …] note${notesLeft === 1 ? "" : "s"} left to replace.` : ""}</small>
      </label>

      <fieldset className="guide-listings">
        <legend>Businesses this guide sends readers to</legend>
        {listings.length === 0 && <p className="admin-form-note">None yet. A guide needs at least one live business to be published.</p>}
        {listings.map((listing, index) => (
          <div className="guide-listing" key={listing.organizationId}>
            <strong>{nameOf(listing.organizationId)}</strong>
            <input aria-label={`Why ${nameOf(listing.organizationId)}`} placeholder="A line on why (optional)" value={listing.note} maxLength={200} onChange={(e) => setListings((current) => current.map((l, i) => (i === index ? { ...l, note: e.target.value } : l)))} />
            <span className="guide-listing-buttons">
              <button type="button" className="admin-mini" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">↑</button>
              <button type="button" className="admin-mini" disabled={index === listings.length - 1} onClick={() => move(index, 1)} aria-label="Move down">↓</button>
              <button type="button" className="admin-mini" onClick={() => setListings((current) => current.filter((_, i) => i !== index))}>Remove</button>
            </span>
          </div>
        ))}
        <div className="guide-listing-add">
          <select value={adding} onChange={(e) => setAdding(Number(e.target.value))} aria-label="Add a business">
            <option value={0}>Add a live business…</option>
            {businesses.filter((business) => !listings.some((l) => l.organizationId === business.id)).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
          <button type="button" className="admin-action" disabled={!adding} onClick={() => { setListings((current) => [...current, { organizationId: adding, note: "" }]); setAdding(0); }}>Add</button>
        </div>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-action is-primary" disabled={busy}>{busy ? "Saving…" : guide ? "Save" : "Save as a draft"}</button>
        {guide?.status === "draft" && <button type="button" className="admin-action" disabled={busy || problem !== null} onClick={() => void setStatus("publish")} title={problem ?? undefined}>Publish</button>}
        {guide?.status === "published" && <button type="button" className="admin-action is-danger" disabled={busy} onClick={() => void setStatus("unpublish")}>Take it off the site</button>}
      </div>
      {guide?.status === "draft" && problem && <p className="admin-form-note">Before it can be published: {problem} (Save first.)</p>}
    </form>
  );
}
