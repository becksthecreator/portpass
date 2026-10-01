"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentRequest } from "@/db/paymentRequests";
import { balanceCents, daysOverdue, formatDay, linesSummary, money, payPath, reminderMessage, remindedRecently, sinceLabel, whatsappLink } from "@/lib/paymentRequests/rules";

// The chase list: overdue requests, oldest first. One reminder, one
// customer, one button press at a time: never automatic, never bulk. A
// second reminder on the same day asks first.
export function ChaseList({ rows, businessName, basePath, apiBase, origin, today }: { rows: PaymentRequest[]; businessName: string; basePath: string; apiBase: string; origin: string; today: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function remind(id: number, via: "whatsapp_link" | "email", done: string) {
    setBusy(id);
    setError("");
    const response = await fetch(`${apiBase}/requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remind", via }), keepalive: true });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    setConfirming(null);
    if (!response.ok) return setError(data.error ?? "Could not record the reminder.");
    setNotice(done);
    router.refresh();
  }

  if (rows.length === 0) return <p className="pay-empty">Nothing overdue. Nobody to chase.</p>;

  return (
    <>
      {notice && <p className="pay-notice" role="status">{notice}</p>}
      {error && <p className="pay-notice is-warn" role="alert">{error}</p>}
      <ul className="pay-chase" aria-label="Overdue requests">
        {rows.map((r) => {
          const balance = balanceCents(r);
          const late = daysOverdue(r.dueDate, today);
          const recent = remindedRecently(r.lastRemindedAt);
          const text = reminderMessage({ businessName, customerName: r.customerName, referenceCode: r.referenceCode, lines: r.lines, totalCents: r.totalCents, balanceCents: balance, dueDate: r.dueDate, payUrl: `${origin}${payPath(r.publicToken)}` }, today);
          const asking = recent && confirming !== r.id;
          return (
            <li key={r.id}>
              <header>
                <div>
                  <Link className="pay-ref" href={`${basePath}/${r.id}`}>{r.referenceCode}</Link>
                  <strong>{r.customerName}</strong>
                  <span>{linesSummary(r.lines)}</span>
                </div>
                <div className="pay-chase-amount">
                  <b>{money(balance)}</b>
                  <small>{late} {late === 1 ? "day" : "days"} overdue</small>
                </div>
              </header>
              <p className={`pay-last${recent ? " is-recent" : ""}`}>
                Due {formatDay(r.dueDate, today)} · {r.lastRemindedAt ? `last reminded ${sinceLabel(r.lastRemindedAt)} by ${r.lastRemindedVia === "email" ? "email" : "WhatsApp"}` : "not reminded yet"}
              </p>
              {asking ? (
                <div className="pay-confirm">
                  <span>Already reminded {sinceLabel(r.lastRemindedAt!)}. Send another today?</span>
                  <button type="button" className="pay-btn is-small" onClick={() => setConfirming(r.id)}>Yes, remind again</button>
                </div>
              ) : (
                <div className="pay-btns">
                  <a
                    className="pay-btn is-wa is-small"
                    href={whatsappLink(r.customerPhone, text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Send reminder to ${r.customerName} on WhatsApp`}
                    onClick={() => void remind(r.id, "whatsapp_link", `Reminder to ${r.customerName} opened in WhatsApp. Press send there.`)}
                  >
                    Send reminder (WhatsApp)
                  </a>
                  {r.customerEmail && (
                    <button type="button" className="pay-btn is-small" disabled={busy !== null} aria-label={`Send reminder to ${r.customerName} by email`} onClick={() => void remind(r.id, "email", `Reminder emailed to ${r.customerName}.`)}>
                      {busy === r.id ? "Sending…" : "Send reminder (email)"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
