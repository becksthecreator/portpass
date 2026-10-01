"use client";

import { useMemo, useState } from "react";
import type { WaitlistEntry } from "@/db/shop";
import {
  filterReservations,
  formatNassau,
  isPastHold,
  money,
  paymentMethodLabel,
  reservationStats,
  SOURCE_LABEL,
  whatsappHref,
  type ListedReservation,
  type ReservationFilter,
} from "@/lib/shop/rules";

type Size = { key: string; label: string; stock: number | null };
type Links = { portpass: string; instagram: string; followers: string | null };
type Action = "paid" | "unpaid" | "refunded" | "collected" | "uncollected" | "cancel";

const STATUS_LABEL = { cancelled: "Cancelled", released: "Released (unpaid)" } as const;

// The seller's list (brief 15, §3), built for a phone at a pickup table:
// one card per reservation with big Paid and Collected toggles and a
// WhatsApp link prefilled with the reference code (the seller sends it;
// nothing is ever sent for them). Unpaid reservations past the hold are
// offered back to stock behind a "Release now?" confirm, never on their own.
export function ReservationBoard(props: { orgId: number; orgName: string; dropId: number; holdHours: number; canRefund: boolean; initial: ListedReservation[]; waitlist: WaitlistEntry[]; sizes: Size[]; links: Links | null; requestPaymentHref?: string | null }) {
  const [list, setList] = useState(props.initial);
  const [filter, setFilter] = useState<ReservationFilter>({ variant: null, paid: "all", collected: "all", showCancelled: false });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const stats = useMemo(() => reservationStats(list), [list]);
  const shown = useMemo(() => filterReservations(list, filter), [list, filter]);
  const pastHold = useMemo(() => list.filter((r) => isPastHold(r)), [list]);

  async function act(r: ListedReservation, action: Action) {
    if (action === "cancel" && !window.confirm(`Cancel ${r.referenceCode}? Its sizes go back to stock.`)) return;
    if (action === "refunded" && !window.confirm(`Record that you've refunded ${r.buyerName} ${money(r.totalCents)}?`)) return;
    setBusy(r.id);
    setError("");
    try {
      const response = await fetch(`/api/business/orgs/${props.orgId}/shop/reservations/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; reservation?: ListedReservation };
      if (!response.ok || !data.reservation) throw new Error(data.error ?? "That didn't save.");
      setList((current) => current.map((row) => (row.id === r.id ? data.reservation! : row)));
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
      const response = await fetch(`/api/business/orgs/${props.orgId}/shop/drops/${props.dropId}/release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: pastHold.map((r) => r.id) }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; released?: string[] };
      if (!response.ok) throw new Error(data.error ?? "Could not release them.");
      const released = new Set(data.released ?? []);
      const now = new Date().toISOString();
      setList((current) => current.map((r): ListedReservation => (released.has(r.referenceCode) ? { ...r, status: "released", cancelledAt: now } : r)));
      setNotice(released.size ? `Released ${released.size} back to stock: ${Array.from(released).join(", ")}.` : "Nothing was released: they were paid or changed in the meantime.");
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not release them.");
    } finally {
      setReleasing(false);
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", text);
    }
  }

  const exportBase = `/api/business/orgs/${props.orgId}/shop/drops/${props.dropId}/export`;
  const waitlistBySize = props.waitlist.reduce<Map<string, WaitlistEntry[]>>((map, w) => {
    const key = `${w.productTitle} · ${w.label}`;
    map.set(key, [...(map.get(key) ?? []), w]);
    return map;
  }, new Map());

  return (
    <div className="seller-board">
      <dl className="seller-stats">
        <div><dt>Reserved</dt><dd>{stats.reserved}</dd></div>
        <div><dt>Paid</dt><dd>{stats.paid}</dd></div>
        <div><dt>Collected</dt><dd>{stats.collected}</dd></div>
        <div><dt>Revenue paid</dt><dd>{money(stats.revenuePaidCents)}</dd></div>
      </dl>
      <div className="seller-sources">
        <h2>Orders by source</h2>
        <ul>
          {(["portpass", "instagram", "direct"] as const).map((s) => (
            <li key={s}><span>{SOURCE_LABEL[s]}</span><b>{stats.bySource[s].orders} orders · {stats.bySource[s].paid} paid · {money(stats.bySource[s].paidCents)}</b></li>
          ))}
        </ul>
        <p className="seller-hint">Brought by PortPass and paid: {stats.commissionableOrders} · {money(stats.commissionableCents)}. Commission applies to these only.</p>
      </div>

      {props.links && (
        <details className="seller-share">
          <summary>Share links</summary>
          <ul>
            <li><span>PortPass link (for PortPass to share)</span><button type="button" className="admin-mini" onClick={() => copy("portpass", props.links!.portpass)}>{copied === "portpass" ? "Copied" : "Copy"}</button></li>
            <li><span>Your Instagram link</span><button type="button" className="admin-mini" onClick={() => copy("instagram", props.links!.instagram)}>{copied === "instagram" ? "Copied" : "Copy"}</button></li>
            {props.links.followers && <li><span>Followers&rsquo; private link (works before the public open)</span><button type="button" className="admin-mini" onClick={() => copy("followers", props.links!.followers!)}>{copied === "followers" ? "Copied" : "Copy"}</button></li>}
          </ul>
        </details>
      )}

      {pastHold.length > 0 && (
        <div className="seller-release" role="region" aria-label="Unpaid past the hold">
          <p><strong>{pastHold.length} unpaid {pastHold.length === 1 ? "reservation is" : "reservations are"} past the {props.holdHours}-hour hold.</strong> Releasing puts the sizes back on sale. Nobody is messaged.</p>
          {confirming ? (
            <div className="seller-release-confirm">
              <p>Release now? {pastHold.map((r) => `${r.referenceCode} (${r.buyerName})`).join(", ")}</p>
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
          <span>Size</span>
          <select value={filter.variant ?? ""} onChange={(e) => setFilter({ ...filter, variant: e.target.value || null })}>
            <option value="">All sizes</option>
            {props.sizes.map((s) => <option key={s.key} value={s.key}>{s.label}{s.stock !== null ? ` (${s.stock} left)` : ""}</option>)}
          </select>
        </label>
        <label>
          <span>Paid</span>
          <select value={filter.paid} onChange={(e) => setFilter({ ...filter, paid: e.target.value as ReservationFilter["paid"] })}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Not paid</option>
          </select>
        </label>
        <label>
          <span>Collected</span>
          <select value={filter.collected} onChange={(e) => setFilter({ ...filter, collected: e.target.value as ReservationFilter["collected"] })}>
            <option value="all">All</option>
            <option value="collected">Collected</option>
            <option value="not_collected">Not collected</option>
          </select>
        </label>
        <label className="seller-check">
          <input type="checkbox" checked={filter.showCancelled} onChange={(e) => setFilter({ ...filter, showCancelled: e.target.checked })} />
          <span>Show cancelled and released</span>
        </label>
      </div>

      <p className="seller-exports">
        <a href={`${exportBase}?kind=picklist`}>Pick list (CSV)</a>
        <a href={`${exportBase}?kind=reservations`}>Reservations (CSV)</a>
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="seller-count">{shown.length} of {list.length} reservations</p>
      {shown.length === 0 ? (
        <p className="seller-empty">{list.length ? "Nothing matches these filters." : "No reservations yet."}</p>
      ) : (
        <ul className="seller-reservations">
          {shown.map((r) => {
            const paid = r.paymentStatus === "paid";
            const collected = Boolean(r.collectedAt);
            const active = r.status === "active";
            const late = isPastHold(r);
            const first = r.buyerName.split(/\s+/)[0] ?? r.buyerName;
            return (
              <li key={r.id} className={`seller-res${active ? "" : " is-inactive"}${late ? " is-late" : ""}`}>
                <header>
                  <strong className="seller-ref">{r.referenceCode}</strong>
                  <span>{r.buyerName}</span>
                  <small>{formatNassau(r.createdAt)} · {SOURCE_LABEL[r.source]}</small>
                </header>
                <ul className="seller-res-items">
                  {r.items.map((item) => <li key={item.variantId}><b>{item.qty}×</b> {item.title} <em>{item.label}</em></li>)}
                </ul>
                <p className="seller-res-meta">
                  <strong>{money(r.totalCents)}</strong> · {paymentMethodLabel(r.paymentMethod, r.fulfilment)} · {r.fulfilment === "pickup" ? "Pickup" : `Delivery: ${r.zone ?? ""}`}
                  {r.deliveryNote ? <><br />{r.deliveryNote}</> : null}
                </p>
                <p className="seller-res-status">
                  {!active
                    ? STATUS_LABEL[r.status as "cancelled" | "released"]
                    : paid
                      ? `Paid ${r.paidAt ? formatNassau(r.paidAt) : ""}`
                      : r.paymentStatus === "refunded"
                        ? "Refunded"
                        : late
                          ? `Unpaid · hold ended ${formatNassau(r.holdUntil)}`
                          : `Unpaid · held until ${formatNassau(r.holdUntil)}`}
                  {collected && ` · Collected ${formatNassau(r.collectedAt!)}`}
                </p>
                {active && (
                  <div className="seller-res-actions">
                    <button type="button" className={`seller-toggle${paid ? " is-on" : ""}`} aria-pressed={paid} disabled={busy === r.id || r.paymentStatus === "refunded"} onClick={() => act(r, paid ? "unpaid" : "paid")}>
                      {paid ? "✓ Paid" : "Paid"}
                    </button>
                    <button type="button" className={`seller-toggle${collected ? " is-on" : ""}`} aria-pressed={collected} disabled={busy === r.id} onClick={() => act(r, collected ? "uncollected" : "collected")}>
                      {collected ? "✓ Collected" : "Collected"}
                    </button>
                    <a className="seller-wa" href={whatsappHref(r.buyerPhone, `Hi ${first}, this is ${props.orgName} about your reservation ${r.referenceCode}.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    {(props.canRefund && paid) || (!paid && !collected) ? (
                      <details className="seller-more">
                        <summary>More</summary>
                        {props.canRefund && paid && <button type="button" className="admin-mini" disabled={busy === r.id} onClick={() => act(r, "refunded")}>Record refund</button>}
                        {!paid && props.requestPaymentHref && <a className="admin-mini" href={`${props.requestPaymentHref}${r.id}`}>Request payment</a>}
                        {!paid && !collected && <button type="button" className="admin-mini" disabled={busy === r.id} onClick={() => act(r, "cancel")}>Cancel reservation</button>}
                      </details>
                    ) : null}
                  </div>
                )}
                <p className="seller-res-contact">{r.buyerPhone}{r.buyerEmail ? ` · ${r.buyerEmail}` : ""}</p>
              </li>
            );
          })}
        </ul>
      )}

      {waitlistBySize.size > 0 && (
        <section className="seller-waitlist" aria-labelledby="seller-waitlist-title">
          <h2 id="seller-waitlist-title">Waitlist</h2>
          <p className="seller-hint">People who asked for a sold-out size. Nobody is messaged automatically: reach out if stock comes back.</p>
          {Array.from(waitlistBySize.entries()).map(([size, entries]) => (
            <details key={size}>
              <summary>{size} · {entries.length} waiting</summary>
              <ul>
                {entries.map((w) => (
                  <li key={w.id}>
                    <span>{w.name} · {w.phone}{w.email ? ` · ${w.email}` : ""}</span>
                    <a className="seller-wa" href={whatsappHref(w.phone, `Hi ${w.name.split(/\s+/)[0]}, this is ${props.orgName}. ${w.productTitle} in ${w.label} is back.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
