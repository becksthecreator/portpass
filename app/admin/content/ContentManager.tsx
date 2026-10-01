"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Announcement } from "@/lib/siteContent";

type Business = { slug: string; name: string };

async function put(body: Record<string, unknown>): Promise<string | null> {
  const response = await fetch("/api/admin/content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (response?.ok) return null;
  const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
  return data.error ?? "Could not save. Nothing was changed.";
}

// The announcement bar and the homepage card order (brief 08, 1.9).
export function ContentManager({ announcement, businesses, announcementMax, linkLabelMax }: { announcement: Announcement; businesses: Business[]; announcementMax: number; linkLabelMax: number }) {
  const router = useRouter();
  const [text, setText] = useState(announcement.text);
  const [href, setHref] = useState(announcement.href ?? "");
  const [linkLabel, setLinkLabel] = useState(announcement.linkLabel ?? "");
  const [until, setUntil] = useState(announcement.until ?? "");
  const [active, setActive] = useState(announcement.active);
  const [order, setOrder] = useState(businesses);
  const [busy, setBusy] = useState<"announcement" | "order" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function saveAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("announcement");
    setError("");
    setDone("");
    const failed = await put({ announcement: { text, href, linkLabel, until, active } });
    setBusy(null);
    if (failed) return setError(failed);
    setDone(active ? "Saved. The bar is showing on the site." : "Saved. The bar is off.");
    router.refresh();
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  }

  async function saveOrder() {
    setBusy("order");
    setError("");
    setDone("");
    const failed = await put({ spotlight: order.map((business) => business.slug) });
    setBusy(null);
    if (failed) return setError(failed);
    setDone("Saved. The homepage shows this order.");
    router.refresh();
  }

  return (
    <>
      <section className="admin-group" aria-labelledby="content-announcement">
        <h2 id="content-announcement">Announcement bar</h2>
        <form className="admin-content-form" onSubmit={saveAnnouncement}>
          <label>
            <span>What it says ({text.length} of {announcementMax})</span>
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={announcementMax} placeholder="See us at the OWN Conference, 8 to 11 October" />
          </label>
          <label>
            <span>Link (optional): a page on this site, like /apply, or a full https address</span>
            <input value={href} onChange={(event) => setHref(event.target.value)} maxLength={300} inputMode="url" autoCapitalize="none" placeholder="/apply" />
          </label>
          <label>
            <span>The link&rsquo;s words</span>
            <input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} maxLength={linkLabelMax} placeholder="Get listed" />
          </label>
          <label>
            <span>Last day it shows (optional)</span>
            <input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
          </label>
          <label className="admin-content-check">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            <span>Show the bar on every PortPass page</span>
          </label>
          {text && (
            <p className="site-announcement admin-content-preview" role="note">
              <span>{text}</span>
              {href && <span className="admin-content-preview-link">{linkLabel || "See more"}</span>}
            </p>
          )}
          <div className="admin-form-actions">
            <button type="submit" className="admin-action is-primary" disabled={busy !== null}>{busy === "announcement" ? "Saving…" : "Save the announcement"}</button>
          </div>
        </form>
      </section>

      <section className="admin-group" aria-labelledby="content-order">
        <h2 id="content-order">Homepage &ldquo;Open now&rdquo; order</h2>
        {order.length === 0 ? (
          <p className="admin-empty">No business is live in the directory yet.</p>
        ) : (
          <>
            <p className="admin-form-note">The first business is the first card on the homepage. A business that goes live later is added at the end.</p>
            <ol className="admin-content-order">
              {order.map((business, index) => (
                <li key={business.slug}>
                  <span>{index + 1}. {business.name}</span>
                  <span className="admin-content-order-buttons">
                    <button type="button" className="admin-action" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${business.name} up`}>Up</button>
                    <button type="button" className="admin-action" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move ${business.name} down`}>Down</button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="admin-form-actions">
              <button type="button" className="admin-action is-primary" onClick={saveOrder} disabled={busy !== null}>{busy === "order" ? "Saving…" : "Save this order"}</button>
            </div>
          </>
        )}
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="admin-row-done" role="status">{done}</p>}
    </>
  );
}
