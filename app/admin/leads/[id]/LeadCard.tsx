"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Lead } from "@/db/leads";
import { BOOKING_METHOD_LABEL, BOOKING_METHODS, LEAD_PIPELINE, LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, leadWhatsappLink, SCORE_ACTION_LABEL, scoreAction, type LeadStatus } from "@/lib/scout/leads";

type SectionOption = { slug: string; name: string; subcategories: Array<{ slug: string; name: string }> };

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-BS", { dateStyle: "medium", timeZone: "America/Nassau" }) : "";
}

// The lead card (brief 14 §3). "Copy" and "Open in WhatsApp" hand the draft
// to the founder, who sends it themselves. Nothing here sends a message.
export function LeadCard({ lead: initial, sections, aiReady }: { lead: Lead; sections: SectionOption[]; aiReady: boolean }) {
  const router = useRouter();
  const [lead, setLead] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initial.draftMessage ?? "");
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState(initial.section ?? "");

  async function call(label: string, url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(label);
    setError("");
    setNotice("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as Record<string, unknown>) : {};
    setBusy(null);
    if (!response || !response.ok) {
      setError(typeof data.error === "string" ? data.error : "That didn't save.");
      return null;
    }
    if (data.lead) setLead(data.lead as Lead);
    return data;
  }

  async function setStatus(status: LeadStatus) {
    if (status === "do_not_contact" && !confirm(`Mark ${lead.businessName} as "Do not contact"? This is permanent: the lead disappears from every list, its contact details are wiped, and it can never be added again.`)) return;
    const data = await call(`status:${status}`, `/api/admin/leads/${lead.id}`, "PATCH", { status });
    if (!data) return;
    if (status === "do_not_contact") {
      router.push("/admin/leads");
      return;
    }
    setNotice(`Status: ${LEAD_STATUS_LABEL[status]}.`);
  }

  async function research() {
    const data = await call("research", `/api/admin/leads/${lead.id}/enrich`, "POST");
    if (!data) return;
    const updated = data.lead as Lead;
    setMessage(updated.draftMessage ?? "");
    setNotice(typeof data.messageProblem === "string" ? `Scored. No draft message: ${data.messageProblem} Write one yourself or run it again.` : "Scored, with a draft message below. Check the facts against the sources before you send.");
  }

  async function saveMessage() {
    const data = await call("message", `/api/admin/leads/${lead.id}`, "PATCH", { draftMessage: message });
    if (data) setNotice("Message saved.");
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = await call("details", `/api/admin/leads/${lead.id}`, "PATCH", {
      section: form.get("section") || null,
      subsection: form.get("subsection") || null,
      area: form.get("area"),
      island: form.get("island"),
      whatTheyDo: form.get("whatTheyDo"),
      bookingMethod: form.get("bookingMethod"),
      pricesText: form.get("pricesText"),
      instagramHandle: form.get("instagramHandle"),
      phone: form.get("phone"),
      email: form.get("email"),
      websiteUrl: form.get("websiteUrl"),
      owner: form.get("owner"),
      nextStep: form.get("nextStep"),
      lastContactOn: form.get("lastContactOn") || null,
      notes: form.get("notes"),
      warmConnection: form.get("warmConnection") === "on",
    });
    if (data) setNotice("Saved.");
  }

  async function draftPage() {
    const data = await call("draft", `/api/admin/leads/${lead.id}/draft-page`, "POST");
    if (data) setNotice("Draft page created. It is not published: it goes live only after the owner agrees.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  const whatsapp = leadWhatsappLink(lead.whatsappE164, message);
  const action = scoreAction(lead.score);
  const subsections = sections.find((s) => s.slug === section)?.subcategories ?? [];
  const sectionName = sections.find((s) => s.slug === lead.section)?.name ?? "No section yet";

  return (
    <div className="lead-card">
      {notice && <p className="admin-prices-saved" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="lead-panel" aria-labelledby="lead-status-h">
        <h2 id="lead-status-h">Status</h2>
        <div className="lead-pipeline" role="group" aria-label="Status">
          {LEAD_PIPELINE.map((status) => (
            <button key={status} type="button" aria-pressed={lead.status === status} disabled={busy !== null || lead.status === status} onClick={() => setStatus(status)}>{LEAD_STATUS_LABEL[status]}</button>
          ))}
        </div>
        <div className="lead-exits">
          <button type="button" aria-pressed={lead.status === "not_now"} disabled={busy !== null || lead.status === "not_now"} onClick={() => setStatus("not_now")}>Not now</button>
          <button type="button" className="lead-dnc" disabled={busy !== null} onClick={() => setStatus("do_not_contact")}>Do not contact</button>
        </div>
        {lead.lastContactOn && <p className="lead-meta">Last contact: {day(`${lead.lastContactOn}T12:00:00Z`)}</p>}
      </section>

      <section className="lead-panel" aria-labelledby="lead-score-h">
        <h2 id="lead-score-h">Score</h2>
        {lead.score === null ? (
          <p className="lead-meta">Not scored yet.</p>
        ) : (
          <>
            <p className="lead-score-line"><span className={`lead-score lead-score-${action}`}>{lead.score}</span> <strong>{SCORE_ACTION_LABEL[action]}</strong></p>
            {lead.scoreReasons.length > 0 && (
              <ul className="lead-reasons">
                {lead.scoreReasons.map((reason) => (
                  <li key={reason.key}><span>{reason.points > 0 ? `+${reason.points}` : reason.points}</span> {reason.label}{reason.why ? <small>{reason.why}</small> : null}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <button type="button" className="primary-button" disabled={busy !== null || !aiReady} onClick={research}>{busy === "research" ? "Researching…" : lead.enrichedAt ? "Research again" : "Research and score"}</button>
        {!aiReady && <p className="lead-meta">The AI step is off until ANTHROPIC_API_KEY is set.</p>}
        {lead.enrichedAt && <p className="lead-meta">Generated {day(lead.enrichedAt)} by {lead.enrichmentModel}. It only saw public business information. Check it against the sources.</p>}
      </section>

      <section className="lead-panel" aria-labelledby="lead-message-h">
        <h2 id="lead-message-h">First message</h2>
        <p className="lead-meta">You send this yourself, one to one. PortPass never sends it for you.</p>
        <label className="lead-message"><span className="sr-only">Draft message</span>
          <textarea rows={6} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="No draft yet. Research the lead, or write the message here." />
        </label>
        <div className="lead-message-actions">
          <button type="button" className="primary-button" disabled={!message.trim()} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          {whatsapp && message.trim()
            ? <a className="admin-bar-link" href={whatsapp} target="_blank" rel="noopener noreferrer">Open in WhatsApp ↗</a>
            : <span className="lead-meta">{lead.whatsappE164 ? "Write a message to open WhatsApp." : "No WhatsApp number on file."}</span>}
          <button type="button" className="admin-bar-link" disabled={busy !== null || message === (lead.draftMessage ?? "")} onClick={saveMessage}>Save draft</button>
        </div>
      </section>

      <section className="lead-panel" aria-labelledby="lead-facts-h">
        <h2 id="lead-facts-h">Facts</h2>
        <dl className="lead-facts">
          <div><dt>Section</dt><dd>{sectionName}{lead.subsection ? ` · ${subsections.find((c) => c.slug === lead.subsection)?.name ?? lead.subsection}` : ""}</dd></div>
          <div><dt>Where</dt><dd>{[lead.area, lead.island].filter(Boolean).join(", ") || lead.address || "—"}</dd></div>
          <div><dt>How they take bookings</dt><dd>{BOOKING_METHOD_LABEL[lead.bookingMethod]}</dd></div>
          <div><dt>Prices mentioned</dt><dd>{lead.pricesText ?? "—"}</dd></div>
          {lead.googleRating !== null && <div><dt>Google rating</dt><dd>{lead.googleRating} ({lead.googleRatingCount ?? 0} reviews)</dd></div>}
          <div><dt>Source</dt><dd>{LEAD_SOURCE_LABEL[lead.source]}{lead.referralCode ? ` · ${lead.referralCode}` : ""}</dd></div>
          {lead.whyFit && <div><dt>Why a good fit</dt><dd>{lead.whyFit}</dd></div>}
        </dl>
        {lead.sourceUrls.length > 0 && (
          <>
            <h3>Sources</h3>
            <ul className="lead-sources">
              {lead.sourceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "").slice(0, 70)}</a></li>)}
            </ul>
          </>
        )}
      </section>

      <section className="lead-panel" aria-labelledby="lead-page-h">
        <h2 id="lead-page-h">Their page</h2>
        {lead.organizationId ? (
          <p className="lead-meta">A draft page exists. It is not published. <Link href="/admin/businesses?status=draft">Open Businesses</Link></p>
        ) : (
          <>
            <p className="lead-meta">Creates an unpublished draft from this lead. It goes live only after the owner agrees and the usual review.</p>
            <button type="button" className="primary-button" disabled={busy !== null || !lead.section} onClick={draftPage}>{busy === "draft" ? "Creating…" : "Draft their page"}</button>
            {!lead.section && <p className="lead-meta">Pick a section below first.</p>}
          </>
        )}
      </section>

      <section className="lead-panel" aria-labelledby="lead-edit-h">
        <h2 id="lead-edit-h">Edit</h2>
        <form className="admin-form" onSubmit={saveDetails}>
          <div className="admin-form-row">
            <label><span>Section</span>
              <select name="section" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">Not sure yet</option>
                {sections.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label><span>Subsection</span>
              <select name="subsection" defaultValue={lead.subsection ?? ""} disabled={subsections.length === 0}>
                <option value="">—</option>
                {subsections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="admin-form-row">
            <label><span>Area</span><input name="area" defaultValue={lead.area ?? ""} maxLength={80} /></label>
            <label><span>Island</span><input name="island" defaultValue={lead.island ?? ""} maxLength={80} /></label>
          </div>
          <label><span>What they do</span><input name="whatTheyDo" defaultValue={lead.whatTheyDo ?? ""} maxLength={600} /></label>
          <div className="admin-form-row">
            <label><span>How they take bookings</span>
              <select name="bookingMethod" defaultValue={lead.bookingMethod}>
                {BOOKING_METHODS.map((m) => <option key={m} value={m}>{BOOKING_METHOD_LABEL[m]}</option>)}
              </select>
            </label>
            <label><span>Prices mentioned</span><input name="pricesText" defaultValue={lead.pricesText ?? ""} maxLength={600} /></label>
          </div>
          <div className="admin-form-row">
            <label><span>Instagram handle</span><input name="instagramHandle" defaultValue={lead.instagramHandle ? `@${lead.instagramHandle}` : ""} maxLength={200} autoCapitalize="none" /></label>
            <label><span>Business phone or WhatsApp</span><input name="phone" defaultValue={lead.phone ?? ""} maxLength={60} inputMode="tel" /></label>
          </div>
          <div className="admin-form-row">
            <label><span>Business email</span><input name="email" defaultValue={lead.email ?? ""} maxLength={200} inputMode="email" autoCapitalize="none" /></label>
            <label><span>Website</span><input name="websiteUrl" defaultValue={lead.websiteUrl ?? ""} maxLength={300} inputMode="url" autoCapitalize="none" /></label>
          </div>
          <div className="admin-form-row">
            <label><span>Owner (which founder)</span><input name="owner" defaultValue={lead.owner ?? ""} maxLength={80} /></label>
            <label><span>Last contact</span><input name="lastContactOn" type="date" defaultValue={lead.lastContactOn ?? ""} /></label>
          </div>
          <label><span>Next step</span><input name="nextStep" defaultValue={lead.nextStep ?? ""} maxLength={300} /></label>
          <label><span>Notes</span><textarea name="notes" rows={3} defaultValue={lead.notes ?? ""} maxLength={2000} /></label>
          <label className="leads-check"><input type="checkbox" name="warmConnection" defaultChecked={lead.warmConnection} /> <span>Warm connection (someone we already know)</span></label>
          <button className="primary-button" type="submit" disabled={busy !== null}>{busy === "details" ? "Saving…" : "Save"}</button>
        </form>
      </section>
    </div>
  );
}
