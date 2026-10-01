"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Product } from "@/db/shop";
import type { LicenceKind } from "@/lib/shop/rules";
import { downscale } from "../../downscale";

type VariantRow = { key: string; id: number | null; label: string; stock: string };

const QUICK_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const BLOCK_MESSAGE: Record<string, string> = {
  licence: "Saved, but not published: a product with another organisation's marks needs PortPass to approve its licence first. It's waiting in PortPass's licence queue.",
  description: "Saved, but not published: add a description first (buyers must see it before reserving).",
  variants: "Saved, but not published: add at least one size first.",
};

let rowKey = 0;
const nextKey = () => `row-${++rowKey}`;

// The seller's product form (brief 15): name, price, description, photos,
// sizes with stock (blank = unlimited) and the §5 marks question. A product
// using another organisation's crest, logo or official kit design needs a
// licence note and PortPass's approval before it can be published.
export function ProductEditor({ orgId, slug, product, listingPhotos }: { orgId: number; slug: string; product: Product | null; listingPhotos: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(product?.title ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(product.priceCents % 100 ? 2 : 0) : "");
  const [photos, setPhotos] = useState<string[]>(product?.photos ?? []);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.length ? product.variants.map((v) => ({ key: nextKey(), id: v.id, label: v.label, stock: v.stock === null ? "" : String(v.stock) })) : [],
  );
  const [usesMarks, setUsesMarks] = useState(product?.usesMarks ?? false);
  const [licenceKind, setLicenceKind] = useState<LicenceKind | "">(product?.licenceKind ?? "");
  const [licenceNote, setLicenceNote] = useState(product?.licenceNote ?? "");
  const [isPublished, setIsPublished] = useState(product?.isPublished ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const choices = Array.from(new Set([...photos, ...uploaded, ...listingPhotos]));
  const licenceWaiting = usesMarks && !product?.licenceApprovedAt;

  function togglePhoto(url: string) {
    setPhotos((current) => (current.includes(url) ? current.filter((u) => u !== url) : [...current, url].slice(0, 6)));
  }

  async function upload(file: File) {
    setMessage(null);
    const body = new FormData();
    body.append("file", await downscale(file), file.name.replace(/\.[^.]+$/, "") + ".jpg");
    const response = await fetch(`/api/business/orgs/${orgId}/shop/photos`, { method: "POST", body });
    const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok || !data.url) return setMessage({ kind: "error", text: data.error ?? "Could not upload that photo." });
    setUploaded((current) => [...current, data.url!]);
    setPhotos((current) => [...current, data.url!].slice(0, 6));
  }

  function addSize(label: string) {
    if (variants.some((v) => v.label.toLowerCase() === label.toLowerCase())) return;
    setVariants((current) => [...current, { key: nextKey(), id: null, label, stock: "" }]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const cents = Math.round(Number(price) * 100);
      const response = await fetch(product ? `/api/business/orgs/${orgId}/shop/products/${product.id}` : `/api/business/orgs/${orgId}/shop/products`, {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          priceCents: Number.isFinite(cents) ? cents : 0,
          photos,
          variants: variants.map((v) => ({ id: v.id, label: v.label.trim(), stock: v.stock.trim() === "" ? null : Number(v.stock) })),
          usesMarks,
          licenceKind: usesMarks ? licenceKind : null,
          licenceNote: usesMarks ? licenceNote : null,
          isPublished,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; product?: Product; blocked?: string | null };
      if (!response.ok || !data.product) throw new Error(data.error ?? "That didn't save.");
      if (!product) {
        router.replace(`/business/${slug}/shop/products/${data.product.id}`);
        return;
      }
      setVariants(data.product.variants.map((v) => ({ key: nextKey(), id: v.id, label: v.label, stock: v.stock === null ? "" : String(v.stock) })));
      setIsPublished(data.product.isPublished);
      setMessage(data.blocked ? { kind: "error", text: BLOCK_MESSAGE[data.blocked] ?? "Saved, but not published." } : { kind: "ok", text: data.product.isPublished ? "Saved and published." : "Saved." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product || !window.confirm(`Remove ${product.title}? This can't be undone.`)) return;
    setBusy(true);
    const response = await fetch(`/api/business/orgs/${orgId}/shop/products/${product.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage({ kind: "error", text: data.error ?? "Could not remove it." });
      setBusy(false);
      return;
    }
    router.replace(`/business/${slug}/shop`);
  }

  return (
    <form className="seller-form" onSubmit={save}>
      <label className="seller-field-wide"><span>Name</span><input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Home jersey 2026" /></label>
      <label><span>Price (BSD)</span><input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="65" /></label>
      <label className="seller-field-wide"><span>Description (shown before buyers reserve)</span><textarea rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Fabric, fit, what's printed on it." /></label>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>Photos</legend>
        {choices.length > 0 && (
          <div className="seller-photo-grid">
            {choices.map((url) => (
              <button key={url} type="button" className={`seller-photo${photos.includes(url) ? " is-on" : ""}`} aria-pressed={photos.includes(url)} onClick={() => togglePhoto(url)}>
                <img src={url} alt="" />
                <span>{photos.includes(url) ? `#${photos.indexOf(url) + 1}` : "Use"}</span>
              </button>
            ))}
          </div>
        )}
        <label className="seller-upload">
          <span>Upload a photo</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
        </label>
      </fieldset>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>Sizes and stock</legend>
        <p className="seller-hint">Stock is what&rsquo;s left to reserve. Leave it blank for no limit. A reservation takes stock; a cancellation or a release gives it back.</p>
        <div className="seller-quick">
          {QUICK_SIZES.map((s) => <button key={s} type="button" className="admin-mini" onClick={() => addSize(s)} disabled={variants.some((v) => v.label === s)}>+ {s}</button>)}
          <button type="button" className="admin-mini" onClick={() => setVariants((c) => [...c, { key: nextKey(), id: null, label: "", stock: "" }])}>+ Other</button>
        </div>
        {variants.length === 0 && <p className="seller-hint">No sizes yet.</p>}
        <ul className="seller-variants">
          {variants.map((v, index) => (
            <li key={v.key}>
              <input aria-label="Size or colourway" required maxLength={40} value={v.label} onChange={(e) => setVariants((c) => c.map((row) => (row.key === v.key ? { ...row, label: e.target.value } : row)))} />
              <input aria-label={`Stock for ${v.label || "this size"}`} inputMode="numeric" placeholder="∞" value={v.stock} onChange={(e) => setVariants((c) => c.map((row) => (row.key === v.key ? { ...row, stock: e.target.value.replace(/\D/g, "") } : row)))} />
              <button type="button" className="admin-mini" aria-label={`Move ${v.label} up`} disabled={index === 0} onClick={() => setVariants((c) => { const next = [...c]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button>
              <button type="button" className="admin-mini" aria-label={`Remove ${v.label}`} onClick={() => setVariants((c) => c.filter((row) => row.key !== v.key))}>✕</button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>Crests, logos and official kit designs</legend>
        <label className="seller-check">
          <input type="checkbox" checked={usesMarks} onChange={(e) => setUsesMarks(e.target.checked)} />
          <span>This product uses another organisation&rsquo;s crest, logo or official kit design</span>
        </label>
        {usesMarks && (
          <>
            <div className="seller-radios">
              <label><input type="radio" name="licenceKind" checked={licenceKind === "fan_edition"} onChange={() => setLicenceKind("fan_edition")} /> Fan edition</label>
              <label><input type="radio" name="licenceKind" checked={licenceKind === "official_licensed"} onChange={() => setLicenceKind("official_licensed")} /> Official licensed</label>
            </div>
            <label><span>Licence note</span><textarea rows={3} maxLength={1000} value={licenceNote} onChange={(e) => setLicenceNote(e.target.value)} placeholder="Whose marks they are, and the permission you have (who gave it, when, in writing?)." /></label>
            <p className="seller-hint">{licenceWaiting ? "PortPass has to approve this before it can be published. Changing the note asks for approval again." : "Approved by PortPass. Changing the kind or the note asks for approval again."}</p>
          </>
        )}
      </fieldset>

      <label className="seller-check seller-field-wide">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        <span>Published: shown on your shop page and in drops</span>
      </label>

      {message && <p className={message.kind === "error" ? "form-error" : "seller-ok"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
      <div className="seller-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : product ? "Save product" : "Create product"}</button>
        {product && <button type="button" className="secondary-button" disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </form>
  );
}
