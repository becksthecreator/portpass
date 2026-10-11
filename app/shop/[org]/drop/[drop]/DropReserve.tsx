"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { MAX_QTY_PER_LINE, money, paymentMethodLabel, type Fulfilment, type ShopPaymentMethod } from "@/lib/shop/rules";
import { MadeBadge } from "@/app/_components/market/MadeBadge";

export type DropProductView = {
  id: number;
  title: string;
  description: string;
  priceCents: number;
  photos: string[];
  edition: string | null;
  variants: { id: number; label: string; available: boolean; left: number | null }[];
};

type Props = {
  orgSlug: string;
  orgName: string;
  dropSlug: string;
  followersKey: string | null;
  reservable: boolean;
  waitlistOpen: boolean;
  products: DropProductView[];
  allowPickup: boolean;
  allowDelivery: boolean;
  pickupNote: string;
  deliveryNote: string;
  deliveryZones: string[];
  readyOn: string | null;
  paymentMethods: ShopPaymentMethod[];
  holdHours: number;
};

type Line = { variantId: number; qty: number };

// The buyer's half of a drop (brief 15): pick sizes, see the itemised
// order with its total, leave a name and number, choose pickup or delivery
// and how to pay the seller. Prices here are for display; the server
// re-prices from the database. Sold-out sizes offer the waitlist instead.
export function DropReserve(props: Props) {
  const router = useRouter();
  const { products, orgName } = props;
  const [chosen, setChosen] = useState<Record<number, number | null>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [soldOut, setSoldOut] = useState<Set<number>>(new Set());
  const [waitlistFor, setWaitlistFor] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", zone: "", deliveryNote: "" });
  const [fulfilment, setFulfilment] = useState<Fulfilment | "">(props.allowPickup && !props.allowDelivery ? "pickup" : !props.allowPickup && props.allowDelivery ? "seller_delivery" : "");
  const [payment, setPayment] = useState<ShopPaymentMethod | "">(props.paymentMethods.length === 1 ? props.paymentMethods[0] : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const byVariant = useMemo(() => {
    const map = new Map<number, { product: DropProductView; label: string }>();
    for (const product of products) for (const v of product.variants) map.set(v.id, { product, label: v.label });
    return map;
  }, [products]);

  const isAvailable = (v: DropProductView["variants"][number]) => v.available && !soldOut.has(v.id);
  const total = lines.reduce((sum, line) => sum + line.qty * (byVariant.get(line.variantId)?.product.priceCents ?? 0), 0);

  function add(productId: number) {
    const variantId = chosen[productId];
    if (!variantId) return;
    setError("");
    setLines((current) => {
      const existing = current.find((l) => l.variantId === variantId);
      if (existing) return current.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY_PER_LINE, l.qty + 1) } : l));
      return [...current, { variantId, qty: 1 }];
    });
  }

  function setQty(variantId: number, qty: number) {
    setLines((current) => (qty <= 0 ? current.filter((l) => l.variantId !== variantId) : current.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY_PER_LINE, qty) } : l))));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lines.length) return setError("Pick a size first.");
    if (!fulfilment) return setError(`Choose pickup or delivery.`);
    if (!payment) return setError(`Choose how you'll pay ${orgName}.`);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/shop/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org: props.orgSlug,
          drop: props.dropSlug,
          key: props.followersKey ?? undefined,
          items: lines,
          buyerName: form.name,
          buyerPhone: form.phone,
          buyerEmail: form.email,
          fulfilment,
          zone: form.zone,
          deliveryNote: form.deliveryNote,
          paymentMethod: payment,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; soldOut?: number[]; receiptUrl?: string };
      if (!response.ok) {
        if (data.soldOut?.length) {
          setSoldOut((current) => new Set([...current, ...data.soldOut!]));
          setLines((current) => current.filter((l) => !data.soldOut!.includes(l.variantId)));
        }
        throw new Error(data.error ?? "Could not save your reservation. Please try again.");
      }
      router.push(data.receiptUrl!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your reservation. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="shop-reserve">
      <section className="shop-section" aria-labelledby="drop-products">
        <h2 id="drop-products">In this drop</h2>
        <div className="shop-drop-products">
          {products.map((product) => {
            const selected = chosen[product.id] ?? null;
            const selectedVariant = product.variants.find((v) => v.id === selected) ?? null;
            return (
              <article key={product.id} id={`product-${product.id}`} className="shop-card shop-card-drop">
                <div className="shop-card-photo">
                  {product.photos[0] ? <img src={product.photos[0]} alt={product.title} /> : <span aria-hidden="true">{product.title.slice(0, 1)}</span>}
                  {product.edition && <span className="shop-edition">{product.edition}</span>}
                  <MadeBadge />
                </div>
                {product.photos.length > 1 && (
                  <div className="shop-thumbs">
                    {product.photos.slice(1).map((url) => <img key={url} src={url} alt="" loading="lazy" />)}
                  </div>
                )}
                <div className="shop-card-body">
                  <h3>{product.title}</h3>
                  <p className="shop-price">{money(product.priceCents)}</p>
                  <p className="shop-card-desc">{product.description}</p>
                  <fieldset className="shop-sizes-picker" disabled={!props.reservable && !props.waitlistOpen}>
                    <legend>Size</legend>
                    <div role="radiogroup" aria-label={`${product.title} size`}>
                      {product.variants.map((v) => {
                        const available = isAvailable(v);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={selected === v.id}
                            className={`shop-size${available ? "" : " is-sold-out"}`}
                            onClick={() => {
                              setChosen((c) => ({ ...c, [product.id]: v.id }));
                              setWaitlistFor(available ? null : v.id);
                            }}
                          >
                            <span className="shop-size-label">{v.label}</span>
                            {!available && <small>Sold out</small>}
                            {available && v.left !== null && <small>{v.left} left</small>}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  {selectedVariant && !isAvailable(selectedVariant) ? (
                    props.waitlistOpen && (waitlistFor === selectedVariant.id ? (
                      <Waitlist orgSlug={props.orgSlug} dropSlug={props.dropSlug} variantId={selectedVariant.id} label={`${product.title} (${selectedVariant.label})`} orgName={orgName} />
                    ) : (
                      <button type="button" className="secondary-button shop-card-action" onClick={() => setWaitlistFor(selectedVariant.id)}>Join the waitlist</button>
                    ))
                  ) : props.reservable ? (
                    <button type="button" className="primary-button shop-card-action" disabled={!selectedVariant} onClick={() => add(product.id)}>
                      {selectedVariant ? `Add ${selectedVariant.label} to my order` : "Choose a size"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {props.reservable && (
        <section className="shop-section shop-order" aria-labelledby="drop-order">
          <h2 id="drop-order">Your order</h2>
          {lines.length === 0 ? (
            <p className="shop-muted">Pick a size above to start your order.</p>
          ) : (
            <form className="shop-order-form" onSubmit={submit}>
              <table className="shop-lines">
                <thead>
                  <tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col" className="shop-num">Price</th></tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const v = byVariant.get(line.variantId)!;
                    return (
                      <tr key={line.variantId}>
                        <td>{v.product.title}<small>{v.label} · {money(v.product.priceCents)} each</small></td>
                        <td>
                          <span className="shop-qty">
                            <button type="button" aria-label={`One fewer ${v.product.title} ${v.label}`} onClick={() => setQty(line.variantId, line.qty - 1)}>−</button>
                            <output aria-live="polite">{line.qty}</output>
                            <button type="button" aria-label={`One more ${v.product.title} ${v.label}`} disabled={line.qty >= MAX_QTY_PER_LINE} onClick={() => setQty(line.variantId, line.qty + 1)}>+</button>
                          </span>
                        </td>
                        <td className="shop-num">{money(line.qty * v.product.priceCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><th scope="row" colSpan={2}>Total</th><td className="shop-num"><strong>{money(total)}</strong></td></tr>
                </tfoot>
              </table>

              <div className="shop-fields">
                <label><span>Your name *</span><input required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
                <label><span>Phone or WhatsApp *</span><PhoneInput required value={form.phone} onChange={(value: string) => setForm((f) => ({ ...f, phone: value }))} /></label>
                <label className="shop-field-wide"><span>Email (optional)</span><input type="email" maxLength={180} autoComplete="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
              </div>

              {props.allowPickup && props.allowDelivery && (
                <fieldset className="shop-choice">
                  <legend>Pickup or delivery *</legend>
                  <label><input type="radio" name="fulfilment" checked={fulfilment === "pickup"} onChange={() => setFulfilment("pickup")} /> Pickup{props.pickupNote ? <small>{props.pickupNote}</small> : null}</label>
                  <label><input type="radio" name="fulfilment" checked={fulfilment === "seller_delivery"} onChange={() => setFulfilment("seller_delivery")} /> Delivery by {orgName}{props.deliveryNote ? <small>{props.deliveryNote}</small> : null}</label>
                </fieldset>
              )}
              {!props.allowDelivery && props.pickupNote && <p className="shop-muted">Pickup: {props.pickupNote}</p>}
              {fulfilment === "seller_delivery" && (
                <div className="shop-fields">
                  <label>
                    <span>Delivery area *</span>
                    <select required value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}>
                      <option value="">Choose…</option>
                      {props.deliveryZones.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </label>
                  <label className="shop-field-wide"><span>Address or directions</span><textarea rows={2} maxLength={300} value={form.deliveryNote} onChange={(e) => setForm((f) => ({ ...f, deliveryNote: e.target.value }))} /></label>
                </div>
              )}

              {props.paymentMethods.length === 0 ? (
                <p className="form-error">{orgName} hasn&rsquo;t set up how to take payment yet, so reservations can&rsquo;t be made. Please check back soon.</p>
              ) : (
                <fieldset className="shop-choice">
                  <legend>How you&rsquo;ll pay {orgName} *</legend>
                  {props.paymentMethods.map((m) => (
                    <label key={m}><input type="radio" name="payment" checked={payment === m} onChange={() => setPayment(m)} /> {paymentMethodLabel(m, fulfilment || "pickup")}{m === "bank_transfer" ? <small>The bank details come with your reference code.</small> : null}</label>
                  ))}
                </fieldset>
              )}

              <div className="shop-before-you-reserve">
                <p><strong>Pay {orgName} directly.</strong> Your reservation is held for {props.holdHours} hours until paid.</p>
                {props.readyOn && <p>Ready for pickup or delivery from {props.readyOn}.</p>}
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button shop-submit" type="submit" disabled={busy || props.paymentMethods.length === 0}>
                {busy ? "Reserving…" : `Reserve · ${money(total)}`}
              </button>
            </form>
          )}
          {lines.length === 0 && error && <p className="form-error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}

function Waitlist({ orgSlug, dropSlug, variantId, label, orgName }: { orgSlug: string; dropSlug: string; variantId: number; label: string; orgName: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("busy");
    setError("");
    try {
      const response = await fetch("/api/shop/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org: orgSlug, drop: dropSlug, variantId, ...form }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not add you to the waitlist.");
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add you to the waitlist.");
      setState("idle");
    }
  }

  if (state === "done") return <p className="shop-waitlist-done" role="status">You&rsquo;re on the waitlist for {label}. If more come in, {orgName} can reach you.</p>;
  return (
    <form className="shop-waitlist" onSubmit={submit}>
      <p><strong>{label} is sold out.</strong> Join the waitlist and {orgName} can reach you if more come in.</p>
      <label><span>Name *</span><input required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
      <label><span>Phone or WhatsApp *</span><PhoneInput required value={form.phone} onChange={(value: string) => setForm((f) => ({ ...f, phone: value }))} /></label>
      <label><span>Email (optional)</span><input type="email" maxLength={180} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="secondary-button" type="submit" disabled={state === "busy"}>{state === "busy" ? "Joining…" : "Join the waitlist"}</button>
    </form>
  );
}
