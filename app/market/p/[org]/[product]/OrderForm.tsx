"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { PhoneInput } from "@/app/_components/PhoneInput";
import type { OrderOptions } from "@/lib/market/orders";
import { MAX_QTY_PER_LINE, money, paymentMethodLabel, type Fulfilment, type ShopPaymentMethod } from "@/lib/shop/rules";

type Variant = { id: number; label: string; left: number | null; available: boolean };
type Zone = { zone: string; feeCents: number; leadDays: number };

type Props = {
  orgSlug: string;
  productSlug: string;
  orgName: string;
  title: string;
  priceCents: number;
  variants: Variant[];
  options: OrderOptions;
  zones: Zone[];
  pickupNote: string;
  holdHours: number;
};

type Line = { variantId: number; qty: number };

// The order form on a Market product page (brief 25, C2): sizes and how
// many, the itemised order with any delivery fee, a name, a number and an
// email, pickup or delivery, and how to pay the seller. Prices here are for
// display; the server prices the order from the database. Nothing is
// charged: the buyer gets an order code and pays the seller directly. It
// holds still (brief 22's Never list: an order form).
export function OrderForm(props: Props) {
  const router = useRouter();
  const { orgName, options } = props;
  const single = props.variants.length === 1;
  const [size, setSize] = useState<number | null>(single && props.variants[0].available ? props.variants[0].id : null);
  const [lines, setLines] = useState<Line[]>([]);
  const [soldOut, setSoldOut] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ name: "", phone: "", email: "", zone: "", deliveryNote: "" });
  const [fulfilment, setFulfilment] = useState<Fulfilment | "">(options.pickup && !options.delivery ? "pickup" : !options.pickup && options.delivery ? "seller_delivery" : "");
  const [payment, setPayment] = useState<ShopPaymentMethod | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const variantById = useMemo(() => new Map(props.variants.map((v) => [v.id, v])), [props.variants]);
  const available = (v: Variant) => v.available && !soldOut.has(v.id);
  const zone = fulfilment === "seller_delivery" ? (props.zones.find((z) => z.zone === form.zone) ?? null) : null;
  const subtotal = lines.reduce((sum, line) => sum + line.qty * props.priceCents, 0);
  const deliveryFee = zone?.feeCents ?? 0;
  const methods = fulfilment ? options.methods[fulfilment] : [];
  const chosenPayment = payment && methods.includes(payment) ? payment : methods.length === 1 ? methods[0] : "";

  // With one size, the order is just how many.
  const singleLine = single ? (lines[0] ?? null) : null;

  function add() {
    if (!size) return setError("Choose a size first.");
    setError("");
    setLines((current) => {
      const existing = current.find((l) => l.variantId === size);
      if (existing) return current.map((l) => (l.variantId === size ? { ...l, qty: Math.min(MAX_QTY_PER_LINE, l.qty + 1) } : l));
      return [...current, { variantId: size, qty: 1 }];
    });
  }

  function setQty(variantId: number, qty: number) {
    setLines((current) => (qty <= 0 ? current.filter((l) => l.variantId !== variantId) : current.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY_PER_LINE, qty) } : l))));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lines.length) return setError(single ? "Add one to your order first." : "Add a size to your order first.");
    if (!fulfilment) return setError("Choose pickup or delivery.");
    if (fulfilment === "seller_delivery" && !zone) return setError("Choose your delivery area.");
    if (!chosenPayment) return setError(`Choose how you'll pay ${orgName}.`);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/market/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org: props.orgSlug,
          product: props.productSlug,
          items: lines,
          buyerName: form.name,
          buyerPhone: form.phone,
          buyerEmail: form.email,
          fulfilment,
          zone: fulfilment === "seller_delivery" ? form.zone : "",
          deliveryNote: fulfilment === "seller_delivery" ? form.deliveryNote : "",
          paymentMethod: chosenPayment,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; soldOut?: number[]; orderUrl?: string };
      if (!response.ok || !data.orderUrl) {
        if (data.soldOut?.length) {
          setSoldOut((current) => new Set([...current, ...data.soldOut!]));
          setLines((current) => current.filter((l) => !data.soldOut!.includes(l.variantId)));
        }
        throw new Error(data.error ?? "We couldn't place your order. Please try again.");
      }
      router.push(data.orderUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't place your order. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form id="order" className="shop-order-form mkt-order-form" onSubmit={submit} noValidate>
      <h2>Order from {orgName}</h2>

      {!single && (
        <fieldset className="shop-sizes-picker">
          <legend>Size</legend>
          <div role="radiogroup" aria-label={`${props.title} size`}>
            {props.variants.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={size === v.id} disabled={!available(v)} className={`shop-size${available(v) ? "" : " is-sold-out"}`} onClick={() => setSize(v.id)}>
                <span className="shop-size-label">{v.label}</span>
                {!available(v) ? <small>Sold out</small> : v.left !== null ? <small>{v.left} left</small> : null}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {single ? (
        <div className="mkt-order-qty">
          <span>How many</span>
          <span className="shop-qty">
            <button type="button" aria-label={`One fewer ${props.title}`} disabled={!singleLine} onClick={() => singleLine && setQty(singleLine.variantId, singleLine.qty - 1)}>−</button>
            <output aria-live="polite">{singleLine?.qty ?? 0}</output>
            <button type="button" aria-label={`One more ${props.title}`} disabled={!size || (singleLine?.qty ?? 0) >= MAX_QTY_PER_LINE} onClick={add}>+</button>
          </span>
          <small>{money(props.priceCents)} each</small>
        </div>
      ) : (
        <button type="button" className="secondary-button" disabled={!size} onClick={add}>
          {size ? `Add ${variantById.get(size)?.label ?? ""} to my order` : "Choose a size"}
        </button>
      )}

      {lines.length > 0 && (
        <table className="shop-lines">
          <thead>
            <tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col" className="shop-num">Price</th></tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const v = variantById.get(line.variantId)!;
              return (
                <tr key={line.variantId}>
                  <td>{props.title}<small>{v.label} · {money(props.priceCents)} each</small></td>
                  <td>
                    <span className="shop-qty">
                      <button type="button" aria-label={`One fewer ${v.label}`} onClick={() => setQty(line.variantId, line.qty - 1)}>−</button>
                      <output aria-live="polite">{line.qty}</output>
                      <button type="button" aria-label={`One more ${v.label}`} disabled={line.qty >= MAX_QTY_PER_LINE} onClick={() => setQty(line.variantId, line.qty + 1)}>+</button>
                    </span>
                  </td>
                  <td className="shop-num">{money(line.qty * props.priceCents)}</td>
                </tr>
              );
            })}
            {deliveryFee > 0 && (
              <tr><td>Delivery to {zone!.zone}</td><td /><td className="shop-num">{money(deliveryFee)}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><th scope="row" colSpan={2}>Total</th><td className="shop-num"><strong>{money(subtotal + deliveryFee)}</strong></td></tr>
          </tfoot>
        </table>
      )}

      <div className="shop-fields">
        <label><span>Your name *</span><input required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
        <label><span>Phone or WhatsApp *</span><PhoneInput required value={form.phone} onChange={(value: string) => setForm((f) => ({ ...f, phone: value }))} /></label>
        <label><span>Email *</span><input type="email" required maxLength={180} autoComplete="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /><small className="mkt-order-hint">Your order code and how to pay {orgName} are sent here.</small></label>
      </div>

      {options.pickup && options.delivery ? (
        <fieldset className="shop-choice">
          <legend>Pickup or delivery *</legend>
          <label><input type="radio" name="fulfilment" checked={fulfilment === "pickup"} onChange={() => setFulfilment("pickup")} /> Pickup<small>{props.pickupNote}</small></label>
          <label><input type="radio" name="fulfilment" checked={fulfilment === "seller_delivery"} onChange={() => setFulfilment("seller_delivery")} /> Delivery by {orgName}</label>
        </fieldset>
      ) : options.pickup ? (
        <p className="shop-muted">Pickup: {props.pickupNote}</p>
      ) : (
        <p className="shop-muted">{orgName} delivers to the areas below.</p>
      )}

      {fulfilment === "seller_delivery" && (
        <div className="shop-fields">
          <label>
            <span>Delivery area *</span>
            <select required value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}>
              <option value="">Choose…</option>
              {props.zones.map((z) => (
                <option key={z.zone} value={z.zone}>{z.zone}: {z.feeCents > 0 ? money(z.feeCents) : "free"}{z.leadDays > 0 ? `, ${z.leadDays} day${z.leadDays === 1 ? "" : "s"}` : ""}</option>
              ))}
            </select>
          </label>
          <label><span>Address or directions</span><textarea rows={2} maxLength={300} value={form.deliveryNote} onChange={(e) => setForm((f) => ({ ...f, deliveryNote: e.target.value }))} /></label>
        </div>
      )}

      {fulfilment && (
        <fieldset className="shop-choice">
          <legend>How you&rsquo;ll pay {orgName} *</legend>
          {methods.map((m) => (
            <label key={m}>
              <input type="radio" name="payment" checked={chosenPayment === m} onChange={() => setPayment(m)} /> {paymentMethodLabel(m, fulfilment)}
              {m === "bank_transfer" ? <small>The bank details come with your order code.</small> : null}
            </label>
          ))}
        </fieldset>
      )}

      <div className="shop-before-you-reserve">
        <p><strong>You pay {orgName} directly.</strong> PortPass never takes the money. {orgName} holds your order for {props.holdHours} hours until it&rsquo;s paid.</p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button shop-submit" type="submit" data-still disabled={busy}>
        {busy ? "Placing your order…" : lines.length ? `Place order · ${money(subtotal + deliveryFee)}` : "Place order"}
      </button>
    </form>
  );
}
