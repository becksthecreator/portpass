"use client";

import { FormEvent, useMemo, useState } from "react";
import { PrivacyNote } from "@/app/_components/PrivacyNote";
import { dayOffMessage, isWorkingDay, workingDaysLabel } from "@/lib/workingDays";
import steamerStyles from "./SteamerLeft.module.css";

export type BookingSlot = { id: number; date: string; startTime: string; endTime: string; location: string };
export type BookingCoach = { id: number; displayName: string; slots: BookingSlot[]; workingDays?: number[] };
export type BookingService = {
  slug: string; name: string; priceCents: number | null; priceUnit: string | null; kind: "session" | "party"; durationMinutes: number;
  // Brief 13: tiers priced per child. A group is 4 to 8 children at a
  // price each; the others are a price for a set number of children.
  minChildren?: number; maxChildren?: number; perChildCents?: number | null;
};

// "$120 · $60 per child", "$35 per child · 4–8 children", "$80".
function priceLine(s: BookingService): string {
  if (s.priceCents === null) return "";
  if (s.priceUnit === "per_child") return `${money(s.priceCents)} per child · ${s.minChildren ?? 4}–${s.maxChildren ?? 8} children`;
  if ((s.minChildren ?? 1) > 1 && s.perChildCents) return `${money(s.priceCents)} · ${money(s.perChildCents)} per child`;
  return money(s.priceCents);
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (iso: string) => DAY.format(new Date(`${iso}T12:00:00Z`));
const money = (cents: number | null) => (cents === null ? "" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`);

// Request a private session or a party (brief 06 v2, Part B): the service
// and its price, a coach, and one of the coach's open times -- or a
// suggested time when none suits. It is a request until the coach
// accepts; the reference (FP-S0007) is numbered like the business's
// payment requests.
export type BookingAttribution = { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; referrerHost: string | null; viaPortpass: boolean };

export function PrivateSessionBooking({
  coaches, services, schemaReady, preferredCoachId, preferredServiceSlug, defaultKind = "session", triggerLabel = "Book a private session →", inline = false, attribution,
}: {
  coaches: BookingCoach[]; services: BookingService[]; schemaReady: boolean; preferredCoachId?: number; defaultKind?: "session" | "party"; triggerLabel?: string;
  // Brief 29, part D: /futprep/book opens the form on the page itself, with
  // a coach and a service already chosen, and passes on where the link came
  // from (brief 05's attribution).
  preferredServiceSlug?: string | null; inline?: boolean; attribution?: BookingAttribution | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const firstService = (preferredServiceSlug ? services.find((s) => s.slug === preferredServiceSlug) : undefined) ?? services.find((s) => s.kind === defaultKind) ?? services[0] ?? null;
  const [serviceSlug, setServiceSlug] = useState<string>(firstService?.slug ?? "");
  const [coachId, setCoachId] = useState<number | null>(preferredCoachId ?? null);
  const [slotId, setSlotId] = useState<number | "suggest">("suggest");
  const [children, setChildren] = useState(4);
  const [suggestedDate, setSuggestedDate] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const service = services.find((s) => s.slug === serviceSlug) ?? null;
  const coach = coaches.find((c) => c.id === coachId) ?? null;
  const slots = coach?.slots ?? [];
  // Brief 29, part C: a suggested date must be one of the coach's working
  // days. The API enforces the same rule; this is the gentle message first.
  const workingDays = coach?.workingDays ?? [];
  const dayOff = coach && slotId === "suggest" && suggestedDate !== "" && !isWorkingDay(workingDays, suggestedDate) ? dayOffMessage(coach.displayName, workingDays) : "";
  const legacyType = service?.kind === "party" ? "birthday" : defaultKind === "party" ? "birthday" : "private_lesson";
  const variableChildren = service ? (service.maxChildren ?? 1) > (service.minChildren ?? 1) : false;
  const childrenCount = service ? (variableChildren ? Math.min(Math.max(children, service.minChildren ?? 1), service.maxChildren ?? 8) : service.minChildren ?? 1) : 1;
  const totalCents = service?.priceCents === null || service?.priceCents === undefined ? null : service.priceUnit === "per_child" ? service.priceCents * childrenCount : service.priceCents;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const usingSlot = typeof slotId === "number";
    try {
      const response = await fetch("/api/futprep/private-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: legacyType,
          serviceSlug: service?.slug ?? null,
          childrenCount: service ? childrenCount : null,
          preferredCoachId: coachId,
          availabilityId: usingSlot ? slotId : null,
          parentName: form.get("parentName"),
          parentEmail: form.get("parentEmail"),
          parentPhone: form.get("parentPhone"),
          childName: form.get("childName"),
          childAge: Number(form.get("childAge")),
          requestedDate: usingSlot ? "" : form.get("requestedDate"),
          requestedStartTime: usingSlot ? "" : form.get("requestedStartTime"),
          durationMinutes: service?.durationMinutes ?? Number(form.get("durationMinutes") ?? 60),
          locationPreference: form.get("locationPreference"),
          sessionGoal: form.get("sessionGoal"),
          notes: form.get("notes"),
          utmSource: attribution?.utmSource ?? null,
          utmMedium: attribution?.utmMedium ?? null,
          utmCampaign: attribution?.utmCampaign ?? null,
          referrerHost: attribution?.referrerHost ?? null,
          viaPortpass: attribution?.viaPortpass ?? false,
        }),
      });
      const data = (await response.json()) as { referenceCode?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not send your request.");
      setReference(data.referenceCode ?? "Sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  const body = <>
        {reference ? <div className="private-session-success">
          <span>Request mailed</span>
          <div className="request-mail-scene" aria-hidden="true">
            <div className="request-mail-card">
              <div className="request-mail-stamp">FP</div>
              <div className="request-mail-lines"><i/><i/><i/></div>
            </div>
            <div className={`request-mail-steamer ${steamerStyles.fromLeft}`}>
              <svg viewBox="0 0 220 120" role="presentation">
                <path className="request-steamer-hull" d="M28 75h154l-18 24H53z" />
                <rect className="request-steamer-deck" x="55" y="54" width="90" height="23" rx="4" />
                <rect className="request-steamer-cabin" x="84" y="34" width="48" height="22" rx="3" />
                <rect className="request-steamer-window" x="92" y="40" width="10" height="8" rx="1" />
                <rect className="request-steamer-window" x="109" y="40" width="10" height="8" rx="1" />
                <rect className="request-steamer-stack" x="61" y="24" width="15" height="34" rx="2" />
                <rect className="request-steamer-stack-cap" x="57" y="20" width="23" height="7" rx="2" />
                <circle className="request-steamer-wheel" cx="151" cy="80" r="17" />
                <path className="request-steamer-wheel-spokes" d="M151 64v32M135 80h32M140 69l22 22M162 69l-22 22" />
                <path className="request-steamer-mail" d="M94 59h28v16H94zM95 60l13 10 13-10" />
              </svg>
              <i className="request-steam-puff puff-one" />
              <i className="request-steam-puff puff-two" />
              <i className="request-steam-puff puff-three" />
            </div>
            <div className="request-mail-water"><i/><i/><i/></div>
          </div>
          <p className="tap-step is-done"><span>3</span>Done</p>
          <h2>On its way.</h2>
          <p>Your request has gone to the Futprep coaches. It is not confirmed until a coach accepts it; you will get an email with the time, place and how to pay.</p>
          <div className="request-reference">
            <small>Your reference</small>
            <strong>{reference}</strong>
            <span className="request-reference-full">Use it as the transfer reference if you pay by bank.</span>
          </div>
          {inline ? <a className="private-session-back" href="/futprep/coaches">Back to the coaches</a> : <button type="button" onClick={() => setOpen(false)}>Done</button>}
        </div> : <>
          <span className="private-session-kicker">Futprep private sessions &amp; parties</span>
          <h2>{service?.kind === "party" ? "Book a football party." : "Book a private session."}</h2>
          <p className="private-session-intro">Pick a service, a coach and one of their open times, or suggest a time. A coach confirms before anything is booked.</p>
          {!schemaReady && <p className="private-session-warning">Booking is being connected. Please try again shortly.</p>}
          <form onSubmit={submit}>
            {/* Brief 27 (C): the same Pick / Who / Done reading as the Saturday
                registration; the fields and rules are brief 29's, unchanged. */}
            <p className="tap-step"><span>1</span>Pick</p>
            {services.length > 0 ? (
              <fieldset className="private-session-services">
                <legend>Service</legend>
                {services.map((s) => (
                  <label key={s.slug} className={s.slug === serviceSlug ? "is-selected" : ""}>
                    <input type="radio" name="service" value={s.slug} checked={s.slug === serviceSlug} onChange={() => setServiceSlug(s.slug)} />
                    <strong>{s.name}</strong>
                    <span>{priceLine(s)} · {s.durationMinutes} min</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <label><span>Request type</span><select name="requestType" defaultValue={legacyType}><option value="private_lesson">Private lesson</option><option value="birthday">Birthday session</option></select></label>
            )}
            <label><span>Coach</span>
              <select value={coachId ?? ""} onChange={(e) => { setCoachId(Number(e.target.value) || null); setSlotId("suggest"); }}>
                <option value="">Any available coach</option>
                {coaches.map((c) => <option value={c.id} key={c.id}>{c.displayName}</option>)}
              </select>
            </label>
            {coach && (
              <fieldset className="private-session-slots">
                <legend>When</legend>
                {slots.map((slot) => (
                  <label key={slot.id} className={slotId === slot.id ? "is-selected" : ""}>
                    <input type="radio" name="slot" checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} />
                    {dayLabel(slot.date)} · {slot.startTime}–{slot.endTime}{slot.location ? ` · ${slot.location}` : ""}
                  </label>
                ))}
                <label className={slotId === "suggest" ? "is-selected" : ""}>
                  <input type="radio" name="slot" checked={slotId === "suggest"} onChange={() => setSlotId("suggest")} />
                  {slots.length ? "None of these: suggest a time" : "No open times posted yet: suggest a time"}
                </label>
              </fieldset>
            )}
            {slotId === "suggest" && (
              <div className="private-session-two">
                <label><span>Suggested date</span><input name="requestedDate" type="date" min={today} required value={suggestedDate} onChange={(e) => setSuggestedDate(e.target.value)} aria-invalid={dayOff ? true : undefined} /></label>
                {coach && workingDays.length > 0 && <p className="private-session-days">{coach.displayName} works {workingDaysLabel(workingDays)}.</p>}
                {dayOff && <p className="form-error" role="alert">{dayOff}</p>}
                <label><span>Suggested start time</span><input name="requestedStartTime" type="time" required /></label>
              </div>
            )}
            <p className="tap-step"><span>2</span>Who</p>
            <div className="private-session-two">
              <label><span>Parent / guardian</span><input name="parentName" autoComplete="name" required /></label>
              <label><span>Phone</span><input name="parentPhone" type="tel" autoComplete="tel" required /></label>
            </div>
            <label><span>Email</span><input name="parentEmail" type="email" autoComplete="email" required /></label>
            <div className="private-session-two">
              <label><span>Child&apos;s name</span><input name="childName" required /></label>
              <label><span>Child&apos;s age</span><input name="childAge" type="number" min="1" max="18" required /></label>
            </div>
            {variableChildren && service && (
              <label><span>How many children?</span>
                <select value={childrenCount} onChange={(e) => setChildren(Number(e.target.value))}>
                  {Array.from({ length: (service.maxChildren ?? 8) - (service.minChildren ?? 4) + 1 }, (_, i) => (service.minChildren ?? 4) + i).map((count) => <option key={count} value={count}>{count} children</option>)}
                </select>
              </label>
            )}
            {!service && (
              <label><span>Length</span><select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></label>
            )}
            {slotId === "suggest" && <label><span>Where would suit you?</span><input name="locationPreference" placeholder="Lyford Cay, home, other…" /></label>}
            <label><span>{service?.kind === "party" ? "About the party (how many children, the occasion)" : "What should the coach focus on?"}</span><textarea name="sessionGoal" rows={3} placeholder={service?.kind === "party" ? "Up to 15 children, a 7th birthday…" : "Confidence, first touch, shooting…"} /></label>
            <label><span>Anything else?</span><textarea name="notes" rows={2} /></label>
            {service && totalCents !== null && (
              <p className="private-session-price">
                Price: <strong>{money(totalCents)}</strong>
                {service.priceUnit === "per_child" ? ` (${money(service.priceCents)} per child × ${childrenCount})` : (service.minChildren ?? 1) > 1 && service.perChildCents ? ` (${money(service.perChildCents)} per child)` : ""}.
                {" "}Pay cash at the session or by bank transfer using your reference.
              </p>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <PrivacyNote childDetails />
            <button className="private-session-submit" disabled={busy || !schemaReady || dayOff !== ""} type="submit">{busy ? "Sending…" : "Send request →"}</button>
          </form>
        </>}
  </>;

  // The full-page form (/futprep/book): no drawer, no motion, the same body.
  if (inline) return <section className="private-session-inline" aria-label="Request a Futprep session">{body}</section>;

  return <>
    <button className="private-session-trigger" type="button" onClick={() => setOpen(true)}>{triggerLabel}</button>
    {open && <div className="private-session-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <aside className="private-session-drawer" role="dialog" aria-modal="true" aria-label="Request a Futprep session" onMouseDown={(e) => e.stopPropagation()}>
        <button className="private-session-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        {body}
      </aside>
    </div>}
  </>;
}
