"use client";

import { useMemo, useState } from "react";
import {
  buyerWhatsappText,
  isFinished,
  ORDER_ACTION_LABEL,
  ORDER_STATUS_LABEL,
  orderPastHold,
  orderStats,
  sellerActions,
  type ListedOrder,
  type OrderAction,
} from "@/lib/market/orders";
import { formatNassau, money, paymentMethodLabel, SOURCE_LABEL, whatsappHref } from "@/lib/shop/rules";

type StatusFilter = "open" | "ready" | "done" | "cancelled" | "all";
type PaidFilter = "all" | "paid" | "unpaid";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "ready", label: "Ready" },
  { value: "done", label: "Handed over" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function matches(order: ListedOrder, status: StatusFilter, paid: PaidFilter, q: string): boolean {
  if (status === "open" && isFinished(order.status)) return false;
  if (status === "ready" && order.status !== "ready") return false;
  if (status === "done" && order.status !== "collected" && order.status !== "delivered") return false;
  if (status === "cancelled" && order.status !== "cancelled") return false;
  if (paid === "paid" && !order.paid) return false;
  if (paid === "unpaid" && (order.paid || order.status === "cancelled")) return false;
  const needle = q.trim().toLowerCase();
  return !needle || order.referenceCode.toLowerCase().includes(needle) || order.buyerName.toLowerCase().includes(needle);
}

// The seller's orders list (brief 25, C4): one card per order with Paid and
// the next step, a WhatsApp link to the buyer prefilled with the code (the
// seller sends it), filters, the two spreadsheets and the numbers. Unpaid
// orders past the hold are offered back to stock behind a "Release now?"
// confirm, never on their own, and nobody is messaged. Holds still.
export function OrdersBoard(props: { orgId: number; orgName: string; holdHours: number; canHandlePayments: boolean; initial: ListedOrder[] }) {
  const [list, setList] = useState(props.initial);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [paid, setPaid] = useState<PaidFilter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const stats = useMemo(() => orderStats(list), [list]);
  const shown = useMemo(() => list.filter((o) => matches(o, status, paid, q)), [list, status, paid, q]);
  const pastHold = useMemo(() => list.filter((o) => orderPastHold(o)), [list]);
  const base = `/api/business/orgs/${props.orgId}/shop/orders`;

  async function act(order: ListedOrder, action: OrderAction) {
    if (action === "cancel" && !window.confirm(`Cancel ${order.referenceCode}? Its sizes go back to stock and its payment request is cancelled. ${order.buyerName} isn't messaged.`)) return;
    if (action === "paid" && !window.confirm(`Mark ${order.referenceCode} paid? Only once ${money(order.totalCents)} has reached you.`)) return;
    setBusy(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${base}/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; order?: ListedOrder };
      if (!response.ok || !data.order) throw new Error(data.error ?? "That didn't save.");
      setList((current) => current.map((row) => (row.id === order.id ? data.order! : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function release() {
    setReleasing(true);
    setError("");
    try {
      const response = await fetch(`${base}/release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: pastHold.map((o) => o.id) }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; released?: string[] };
      if (!response.ok) throw new Error(data.error ?? "Could not release them.");
      const released = new Set(data.released ?? []);
      const now = new Date().toISOString();
      setList((current) => current.map((o): ListedOrder => (released.has(o.referenceCode) ? { ...o, status: "cancelled", cancelledAt: now } : o)));
      setNotice(released.size ? `Released ${released.size} back to stock: ${Array.from(released).join(", ")}.` : "Nothing was released: they were paid or changed in the meantime.");
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not release them.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="seller-board">
      <dl className="seller-stats">
        <div><dt>Orders</dt><dd>{stats.orders}</dd></div>
        <div><dt>Paid</dt><dd>{stats.paid}</dd></div>
        <div><dt>Revenue paid</dt><dd>{money(stats.revenuePaidCents)}</dd></div>
        <div><dt>Brought by PortPass</dt><dd>{stats.broughtByPortpass}</dd></div>
      </dl>
      <p className="seller-hint">Brought by PortPass means the buyer came from a PortPass page or link. Of those, paid: {money(stats.broughtByPortpassPaidCents)}.</p>

      {props.canHandlePayments && pastHold.length > 0 && (
        <div className="seller-release" role="region" aria-label="Unpaid past the hold">
          <p><strong>{pastHold.length} unpaid {pastHold.length === 1 ? "order is" : "orders are"} past the {props.holdHours}-hour hold.</strong> Releasing puts the sizes back on sale and cancels the payment request. Nobody is messaged.</p>
          {confirming ? (
            <div className="seller-release-confirm">
              <p>Release now? {pastHold.map((o) => `${o.referenceCode} (${o.buyerName})`).join(", ")}</p>
              <button type="button" className="primary-button" disabled={releasing} onClick={release}>{releasing ? "Releasing…" : "Release now"}</button>
              <button type="button" className="secondary-button" disabled={releasing} onClick={() => setConfirming(false)}>Not now</button>
            </div>
          ) : (
            <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>Release to stock…</button>
          )}
        </div>
      )}
      {notice && <p className="seller-ok" role="status">{notice}</p>}

      <div className="seller-filters" role="search">
        <label>
          <span>Show</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label>
          <span>Paid</span>
          <select value={paid} onChange={(e) => setPaid(e.target.value as PaidFilter)}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Not paid</option>
          </select>
        </label>
        <label>
          <span>Order code or name</span>
          <input type="search" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <p className="seller-exports">
        <a href={`${base}/export?kind=picklist`}>Pick list (CSV)</a>
        <a href={`${base}/export?kind=orders`}>Orders (CSV)</a>
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="seller-count">{shown.length} of {list.length} orders</p>
      {shown.length === 0 ? (
        <p className="seller-empty">{list.length ? "Nothing matches these filters." : "No orders yet. They arrive here when buyers order on PortPass Market."}</p>
      ) : (
        <ul className="seller-reservations">
          {shown.map((o) => {
            const late = orderPastHold(o);
            const actions = sellerActions(o).filter((a) => props.canHandlePayments || (a !== "paid" && a !== "cancel"));
            const steps = actions.filter((a) => a !== "cancel");
            return (
              <li key={o.id} className={`seller-res${o.status === "cancelled" ? " is-inactive" : ""}${late ? " is-late" : ""}`}>
                <header>
                  <strong className="seller-ref">{o.referenceCode}</strong>
                  <span>{o.buyerName}</span>
                  <small>{formatNassau(o.createdAt)} · {SOURCE_LABEL[o.source]}{o.broughtByPortpass ? " · Brought by PortPass" : ""}</small>
                </header>
                <ul className="seller-res-items">
                  {o.items.map((item) => <li key={item.variantId}><b>{item.qty}×</b> {item.title} <em>{item.label}</em></li>)}
                </ul>
                <p className="seller-res-meta">
                  <strong>{money(o.totalCents)}</strong>{o.deliveryFeeCents > 0 ? ` (incl. ${money(o.deliveryFeeCents)} delivery)` : ""} · {paymentMethodLabel(o.paymentMethod, o.fulfilment)} · {o.fulfilment === "pickup" ? "Pickup" : `Delivery: ${o.zone ?? ""}`}
                  {o.deliveryNote ? <><br />{o.deliveryNote}</> : null}
                </p>
                <p className="seller-res-status">
                  {ORDER_STATUS_LABEL[o.status]}
                  {o.status !== "cancelled" && (o.paid ? ` · Paid ${o.paidAt ? formatNassau(o.paidAt) : ""}` : late ? ` · Unpaid · hold ended ${formatNassau(o.holdUntil)}` : ` · Unpaid · held until ${formatNassau(o.holdUntil)}`)}
                </p>
                {o.status !== "cancelled" && (
                  <div className="seller-res-actions">
                    {steps.map((action) => (
                      <button key={action} type="button" className="seller-toggle" disabled={busy === o.id} onClick={() => act(o, action)}>
                        {ORDER_ACTION_LABEL[action]}
                      </button>
                    ))}
                    <a className="seller-wa" href={whatsappHref(o.buyerPhone, buyerWhatsappText(o, props.orgName, o.payToken && !o.paid && typeof window !== "undefined" ? `${window.location.origin}/pay/${o.payToken}` : null))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    {actions.includes("cancel") && (
                      <details className="seller-more">
                        <summary>More</summary>
                        <button type="button" className="admin-mini" disabled={busy === o.id} onClick={() => act(o, "cancel")}>Cancel order</button>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
