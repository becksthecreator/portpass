"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Drop } from "@/db/shop";
import { isoToNassauLocal, type DropStatus } from "@/lib/shop/rules";

type ProductOption = { id: number; title: string; isPublished: boolean };

// The seller's drop form (brief 15). Times are typed as a Nassau clock
// reads them. With "followers first", the opening time is when the
// private followers' link starts working and the second time is when
// everyone else can reserve.
export function DropEditor({ orgId, slug, drop, products, photos }: { orgId: number; slug: string; drop: Drop | null; products: ProductOption[]; photos: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(drop?.title ?? "");
  const [description, setDescription] = useState(drop?.description ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(drop?.heroImageUrl ?? "");
  const [opensAt, setOpensAt] = useState(isoToNassauLocal(drop?.opensAt ?? null));
  const [closesAt, setClosesAt] = useState(isoToNassauLocal(drop?.closesAt ?? null));
  const [followersFirst, setFollowersFirst] = useState(Boolean(drop?.followersFirstUntil));
  const [followersFirstUntil, setFollowersFirstUntil] = useState(isoToNassauLocal(drop?.followersFirstUntil ?? null));
  const [readyOn, setReadyOn] = useState(drop?.readyOn ?? "");
  const [allowPickup, setAllowPickup] = useState(drop?.allowPickup ?? true);
  const [pickupNote, setPickupNote] = useState(drop?.pickupNote ?? "");
  const [allowDelivery, setAllowDelivery] = useState(drop?.allowDelivery ?? false);
  const [deliveryNote, setDeliveryNote] = useState(drop?.deliveryNote ?? "");
  const [zones, setZones] = useState((drop?.deliveryZones ?? []).join(", "));
  const [productIds, setProductIds] = useState<number[]>(drop?.productIds ?? []);
  const [status, setStatus] = useState<DropStatus>(drop?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(drop ? `/api/business/orgs/${orgId}/shop/drops/${drop.id}` : `/api/business/orgs/${orgId}/shop/drops`, {
        method: drop ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          heroImageUrl: heroImageUrl || null,
          opensAt,
          closesAt,
          followersFirst,
          followersFirstUntil,
          readyOn,
          allowPickup,
          pickupNote,
          allowDelivery,
          deliveryNote,
          deliveryZones: zones.split(",").map((z) => z.trim()).filter(Boolean),
          productIds,
          status,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; drop?: Drop };
      if (!response.ok || !data.drop) throw new Error(data.error ?? "That didn't save.");
      router.replace(`/business/${slug}/shop/drops/${data.drop.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      setBusy(false);
    }
  }

  return (
    <form className="seller-form" onSubmit={save}>
      <label className="seller-field-wide"><span>Name</span><input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Independence drop" /></label>
      <label className="seller-field-wide"><span>Description</span><textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>When</legend>
        <label><span>{followersFirst ? "Followers' link opens (Nassau time)" : "Opens (Nassau time)"}</span><input required type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></label>
        <label className="seller-check">
          <input type="checkbox" checked={followersFirst} onChange={(e) => setFollowersFirst(e.target.checked)} />
          <span>Followers first: a private link opens before everyone else</span>
        </label>
        {followersFirst && <label><span>Opens to everyone (Nassau time)</span><input required type="datetime-local" value={followersFirstUntil} onChange={(e) => setFollowersFirstUntil(e.target.value)} /></label>}
        <label><span>Closes (optional)</span><input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></label>
        <label><span>Ready for pickup or delivery from</span><input type="date" value={readyOn} onChange={(e) => setReadyOn(e.target.value)} /></label>
      </fieldset>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>Getting it to buyers</legend>
        <label className="seller-check"><input type="checkbox" checked={allowPickup} onChange={(e) => setAllowPickup(e.target.checked)} /><span>Pickup</span></label>
        {allowPickup && <label><span>Where and when to collect</span><input maxLength={500} value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} placeholder="Our studio, Bay St. Saturdays 10am–2pm" /></label>}
        <label className="seller-check"><input type="checkbox" checked={allowDelivery} onChange={(e) => setAllowDelivery(e.target.checked)} /><span>We deliver</span></label>
        {allowDelivery && (
          <>
            <label><span>Areas you deliver to (comma separated)</span><input value={zones} onChange={(e) => setZones(e.target.value)} placeholder="Nassau East, Nassau West, Cable Beach" /></label>
            <label><span>Delivery note</span><input maxLength={500} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="$10 delivery, paid with your order" /></label>
          </>
        )}
      </fieldset>

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>Products in this drop</legend>
        {products.length === 0 && <p className="seller-hint">Add products first.</p>}
        {products.map((p) => (
          <label key={p.id} className="seller-check">
            <input type="checkbox" checked={productIds.includes(p.id)} onChange={(e) => setProductIds((c) => (e.target.checked ? [...c, p.id] : c.filter((id) => id !== p.id)))} />
            <span>{p.title}{p.isPublished ? "" : " (not published: buyers won't see it)"}</span>
          </label>
        ))}
      </fieldset>

      {photos.length > 0 && (
        <fieldset className="seller-field-wide seller-fieldset">
          <legend>Main photo</legend>
          <div className="seller-photo-grid">
            <button type="button" className={`seller-photo seller-photo-none${heroImageUrl ? "" : " is-on"}`} aria-pressed={!heroImageUrl} onClick={() => setHeroImageUrl("")}><span>First product photo</span></button>
            {photos.map((url) => (
              <button key={url} type="button" className={`seller-photo${heroImageUrl === url ? " is-on" : ""}`} aria-pressed={heroImageUrl === url} onClick={() => setHeroImageUrl(url)}>
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="seller-field-wide seller-fieldset">
        <legend>Status</legend>
        <div className="seller-radios">
          <label><input type="radio" name="status" checked={status === "draft"} onChange={() => setStatus("draft")} /> Draft (hidden)</label>
          <label><input type="radio" name="status" checked={status === "published"} onChange={() => setStatus("published")} /> Published</label>
          <label><input type="radio" name="status" checked={status === "closed"} onChange={() => setStatus("closed")} /> Closed</label>
        </div>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="seller-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : drop ? "Save drop" : "Create drop"}</button>
      </div>
    </form>
  );
}
