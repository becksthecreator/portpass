"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { recordGrowthEvent } from "@/app/_components/GrowthBeacon";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { PrivacyNote } from "@/app/_components/PrivacyNote";
import type { FutprepAvailability } from "@/db/registrations";
import { track } from "@/lib/analytics";
import { EMPTY_ATTRIBUTION, type Attribution } from "@/lib/attribution";
import { FUTPREP_SITE } from "@/lib/futprepOffSite";
import { howToPayLines, mapsUrl, type QuickHowToPay } from "@/lib/quickRegistration";
import { ageOnDay, classesForBirthday, priceFor, termDates } from "@/lib/registerV4";
import { programTimeRange } from "../config";
import "./register-v4.css";

// The FutPrep register, V4 (Bex picked "V2 features, V3 look", 24 Nov).
// Pick a class (cards turn over for the details, places left stay live,
// the term's dates are one tap away), Who (the parent once, each child with
// a birthday that picks the class, brothers and sisters on the same screen,
// the money in plain numbers), Done (a reference per child, how to pay, the
// calendar file, class updates). One POST per child to the same route as
// before (mode "quick", with the exact birthday). The server keeps every
// rule; this screen only says the same things earlier. No card payments:
// cash and bank transfer only. Motion is CSS only and stops under
// prefers-reduced-motion (register-v4.css).

type Offer = FutprepAvailability;
export type V4PaymentMethod = "bank_transfer" | "cash";
type Plan = "weekly" | "term";
type Child = { id: number; name: string; dob: string; healthNotes: string; offerKey: string };
type Outcome = { child: Child; offer: Offer; referenceCode?: string; amountDueCents?: number; error?: string };
type Family = { parent: { name: string; phone: string; relationship: string } | null; children: Array<{ name: string; dob: string | null }> };

const offerKey = (o: Pick<Offer, "programId" | "termId">) => `${o.programId}:${o.termId}`;
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const short = (iso: string) => SHORT.format(new Date(`${iso}T12:00:00Z`));
const long = (iso: string) => LONG.format(new Date(`${iso}T12:00:00Z`));
const METHOD_LABEL: Record<V4PaymentMethod, string> = { bank_transfer: "Bank transfer", cash: "Cash at the field" };
const MAX_CHILDREN = 4;
const PLACES_EVERY_MS = 45_000;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Your child";

export function RegisterV4({ offers, attribution = EMPTY_ATTRIBUTION, initialOfferKey = null, howToPay, methods, closedNotice = null, today }: {
  offers: Offer[]; attribution?: Attribution; initialOfferKey?: string | null;
  howToPay: QuickHowToPay | null; methods: V4PaymentMethod[];
  closedNotice?: string | null; today: string;
}) {
  const open = offers;
  const firstOpen = open.find((o) => o.spotsRemaining > 0);
  const preselected = initialOfferKey && open.some((o) => offerKey(o) === initialOfferKey) ? initialOfferKey : firstOpen ? offerKey(firstOpen) : "";
  const [step, setStep] = useState<"pick" | "who" | "done">("pick");
  const [picked, setPicked] = useState(preselected);
  const [turned, setTurned] = useState<string | null>(null);
  const [places, setPlaces] = useState<Record<string, number>>(() => Object.fromEntries(open.map((o) => [`${o.slug}:${o.termId}`, o.spotsRemaining])));
  const [parent, setParent] = useState({ name: "", phone: "", email: "" });
  const [children, setChildren] = useState<Child[]>([{ id: 1, name: "", dob: "", healthNotes: "", offerKey: preselected }]);
  const [plan, setPlan] = useState<Plan>("term");
  const [method, setMethod] = useState<V4PaymentMethod | "">(methods.length === 1 ? methods[0] : "");
  const [photo, setPhoto] = useState<"yes" | "no" | "">("");
  const [consent, setConsent] = useState(false);
  const [family, setFamily] = useState<"idle" | "loading" | "filled" | "signin" | "none">("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const started = useRef(false);
  const nextId = useRef(2);

  const byKey = useMemo(() => new Map(open.map((o) => [offerKey(o), o])), [open]);
  const left = useCallback((o: Offer) => places[`${o.slug}:${o.termId}`] ?? o.spotsRemaining, [places]);

  // Places left stay live while the page is open (counts only, /api/futprep/places).
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/futprep/places", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { places?: Array<{ slug: string; termId: number; placesLeft: number }> };
        if (!stop && data.places) setPlaces((now) => ({ ...now, ...Object.fromEntries(data.places!.map((p) => [`${p.slug}:${p.termId}`, p.placesLeft])) }));
      } catch {
        // The numbers the page loaded with stay; the POST still decides.
      }
    };
    const timer = window.setInterval(load, PLACES_EVERY_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { stop = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  // "Use my details": only for a parent signed in to PortPass (the email-code
  // sign-in), never looked up from a typed address. Never fills health notes.
  const useMyDetails = useCallback(async () => {
    setFamily("loading");
    try {
      const response = await fetch("/api/futprep/family", { cache: "no-store" });
      if (response.status === 401) return setFamily("signin");
      if (!response.ok) return setFamily("none");
      const data = (await response.json()) as Family;
      if (!data.parent && data.children.length === 0) return setFamily("none");
      if (data.parent) setParent((p) => ({ name: data.parent!.name || p.name, phone: data.parent!.phone || p.phone, email: p.email }));
      if (data.children.length) {
        setChildren(data.children.slice(0, MAX_CHILDREN).map((c, i) => {
          const fits = c.dob ? classesForBirthday(c.dob, open.filter((o) => left(o) > 0)) : [];
          return { id: i + 1, name: c.name, dob: c.dob ?? "", healthNotes: "", offerKey: fits[0] ? offerKey(fits[0]) : picked };
        }));
        nextId.current = data.children.length + 1;
      }
      setFamily("filled");
    } catch {
      setFamily("none");
    }
  }, [open, left, picked]);

  // Coming back from sign-in with ?details=1 fills the form straight away,
  // once.
  const askedOnLoad = useRef(false);
  useEffect(() => {
    if (askedOnLoad.current) return;
    askedOnLoad.current = true;
    if (new URLSearchParams(window.location.search).get("details") === "1") void useMyDetails();
  }, [useMyDetails]);

  function go(next: "pick" | "who" | "done") {
    setStep(next);
    setError("");
    window.scrollTo(0, 0);
  }

  function choose(o: Offer) {
    setPicked(offerKey(o));
    setChildren((list) => list.map((c, i) => (i === 0 ? { ...c, offerKey: offerKey(o) } : c)));
    setTurned(null);
    if (!started.current) {
      started.current = true;
      track("register_start", { org: "futprep" });
      recordGrowthEvent("register_start");
    }
    go("who");
  }

  const setChild = (id: number, patch: Partial<Child>) => setChildren((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  function addChild() {
    if (children.length >= MAX_CHILDREN) return;
    setChildren((list) => [...list, { id: nextId.current++, name: "", dob: "", healthNotes: "", offerKey: picked }]);
  }

  const lines = children.map((c) => {
    const offer = byKey.get(c.offerKey) ?? null;
    const sessions = offer ? termDates(offer).length : 0;
    return { child: c, offer, sessions, price: offer ? priceFor(offer, sessions, plan) : null };
  });
  const total = lines.reduce((sum, l) => sum + (l.price?.dueCents ?? 0), 0);
  const saving = plan === "term" ? lines.reduce((sum, l) => sum + (l.price?.savingCents ?? 0), 0) : 0;
  const anyWeekly = lines.some((l) => l.offer && l.offer.programType !== "camp");

  function problem(): string | null {
    if (!parent.name.trim() || !parent.phone.trim()) return "Add your name and WhatsApp number.";
    if (parent.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email.trim())) return "That email address doesn't look right. Leave it blank if you'd rather not give one.";
    for (const l of lines) {
      const who = l.child.name.trim() ? firstName(l.child.name) : "each child";
      if (!l.child.name.trim()) return "Add each child's name.";
      if (!l.child.dob) return `Add ${who}'s birthday.`;
      if (!l.offer) return `Pick a class for ${who}.`;
      if (!classesForBirthday(l.child.dob, [l.offer]).length) return `${l.offer.name} is for ages ${l.offer.ageLabel}, counted on ${long(l.offer.termStartDate)}. Pick the class that fits ${who}.`;
    }
    if (!method) return "Choose how you'll pay.";
    if (!photo) return "Choose Yes or No for photos and video.";
    if (!consent) return "Tick the consent box to register.";
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = problem();
    if (message) return setError(message);
    setBusy(true);
    setError("");
    const done: Outcome[] = [];
    // One POST per child: each takes its own place under its class's lock.
    for (const l of lines) {
      const offer = l.offer!;
      try {
        const response = await fetch("/api/futprep/registrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "quick",
            parentName: parent.name.trim(),
            parentPhone: parent.phone,
            parentEmail: parent.email.trim(),
            childName: l.child.name.trim(),
            childDob: l.child.dob,
            healthNotes: l.child.healthNotes.trim(),
            programSlug: offer.slug,
            termId: offer.termId,
            paymentFrequency: offer.programType === "camp" ? "term" : plan,
            paymentMethod: method,
            photoConsent: photo,
            consentAccepted: true,
            ...attribution,
          }),
        });
        const data = (await response.json()) as { registration?: { referenceCode: string; amountDueCents: number }; error?: string };
        if (!response.ok || !data.registration) done.push({ child: l.child, offer, error: data.error ?? "We couldn't register this child." });
        else done.push({ child: l.child, offer, referenceCode: data.registration.referenceCode, amountDueCents: data.registration.amountDueCents });
      } catch {
        done.push({ child: l.child, offer, error: "We couldn't reach Futprep. Check your connection and try again." });
      }
    }
    setBusy(false);
    if (done.every((d) => d.error)) {
      setError(done.map((d) => `${firstName(d.child.name)}: ${d.error}`).join(" "));
      return;
    }
    setOutcomes(done);
    go("done");
  }

  function another() {
    setOutcomes([]);
    setChildren([{ id: nextId.current++, name: "", dob: "", healthNotes: "", offerKey: picked }]);
    setConsent(false);
    go("who");
  }

  const progress = step === "pick" ? 1 : step === "who" ? 2 : 3;

  return (
    <section className="v4" data-step={step}>
      <ol className="v4-steps" aria-label="Steps">
        {["Pick", "Who", "Done"].map((label, i) => (
          <li key={label} aria-current={progress === i + 1 ? "step" : undefined} className={progress > i ? "is-reached" : ""}>
            <span>{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === "pick" && (
        <div className="v4-screen" key="pick">
          <h1 className="v4-title">Pick your <em>class.</em></h1>
          {open.length === 0 ? (
            <p className="v4-closed">{closedNotice ?? "Nothing is open for registration right now."} Private sessions run all year: <a href="/futprep/book">book one with a coach</a>.</p>
          ) : (
            <>
              <p className="v4-sub">{open[0].termName} · {short(open[0].termStartDate)} to {short(open[0].termEndDate)} · {open[0].location}</p>
              <div className="v4-returning">
                {family === "filled" ? (
                  <p><strong>Filled in from your account.</strong> Check it, then pick a class.</p>
                ) : family === "signin" ? (
                  <p><strong>Sign in first.</strong> We email you a 6-digit code; your details fill in after. <a href={`/login?next=${encodeURIComponent("/futprep/register?details=1")}`}>Sign in with your email</a></p>
                ) : family === "none" ? (
                  <p>We couldn&rsquo;t find earlier details for this account. Fill the form in below.</p>
                ) : (
                  <>
                    <p><strong>Been with us before?</strong> Sign in and we&rsquo;ll fill in your family&rsquo;s details. Never health notes.</p>
                    <button type="button" onClick={() => void useMyDetails()} disabled={family === "loading"}>{family === "loading" ? "Looking…" : "Use my details"}</button>
                  </>
                )}
              </div>

              <ul className="v4-cards">
                {open.map((o) => {
                  const k = offerKey(o);
                  const n = left(o);
                  const full = n === 0;
                  const dates = termDates(o);
                  const term = priceFor(o, dates.length, "term");
                  return (
                    <li key={k} className={`v4-card${turned === k ? " is-turned" : ""}${picked === k ? " is-picked" : ""}${full ? " is-full" : ""}`}>
                      <div className="v4-card-inner">
                        <div className="v4-face v4-front" aria-hidden={turned === k}>
                          <p className="v4-ages">Ages {o.ageLabel}{o.programType === "camp" ? " · Camp" : ""}</p>
                          <h2>{o.name.replace(/^Futprep\s+/i, "")}</h2>
                          <p className="v4-when">{o.programType === "camp" ? `${short(o.termStartDate)} to ${short(o.termEndDate)}` : `${o.day}s · ${programTimeRange(o)}`}</p>
                          <p className="v4-left" aria-live="polite"><span className={full ? "is-full" : ""} />{full ? "Full" : `${n} ${n === 1 ? "place" : "places"} left`}</p>
                          <p className="v4-from">
                            {o.programType === "camp" ? <><b>{formatPriceCents(o.termFeeCents)}</b> the camp</> : <><b>{formatPriceCents(o.weeklyFeeCents)}</b> a session · {formatPriceCents(o.termFeeCents)} the term</>}
                          </p>
                          <div className="v4-card-actions">
                            <button type="button" className="v4-ghost" onClick={() => setTurned(k)}>Details</button>
                            {full
                              ? <a className="v4-go" href={`/futprep/register?flow=classic&program=${encodeURIComponent(o.slug)}&term=${o.termId}`}>Join the waitlist</a>
                              : <button type="button" className="v4-go" onClick={() => choose(o)}>Choose</button>}
                          </div>
                        </div>
                        <div className="v4-face v4-back" aria-hidden={turned !== k}>
                          <h2>{o.name.replace(/^Futprep\s+/i, "")}</h2>
                          <dl>
                            <div><dt>Ages</dt><dd>{o.ageLabel}</dd></div>
                            <div><dt>When</dt><dd>{o.programType === "camp" ? `${o.dailyStartTime || o.time}–${o.dailyEndTime || o.endTime}, weekdays` : `${o.day}s ${programTimeRange(o)}`}</dd></div>
                            <div><dt>Where</dt><dd>{o.location}{o.locationNote ? `, ${o.locationNote}` : ""}</dd></div>
                            <div><dt>Price</dt><dd>{o.programType === "camp" ? formatPriceCents(o.termFeeCents) : `${formatPriceCents(o.weeklyFeeCents)} a session, or ${formatPriceCents(o.termFeeCents)} for the term${term.savingCents ? ` (save ${formatPriceCents(term.savingCents)})` : ""}`}</dd></div>
                            <div><dt>Places left</dt><dd>{n} of {o.effectiveCap}</dd></div>
                          </dl>
                          <div className="v4-meter" aria-hidden="true"><i style={{ transform: `scaleX(${o.effectiveCap ? Math.min(1, (o.effectiveCap - n) / o.effectiveCap) : 1})` }} /></div>
                          <div className="v4-card-actions">
                            <button type="button" className="v4-ghost" onClick={() => setTurned(null)}>Back</button>
                            {!full && <button type="button" className="v4-go" onClick={() => choose(o)}>Choose</button>}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {open[0].programType !== "camp" && (
                <details className="v4-box">
                  <summary>See the {termDates(open[0]).length} {open[0].day}s</summary>
                  <ol className="v4-cal">
                    {termDates(open[0]).map((d, i) => <li key={d} className={i === 0 ? "is-first" : ""}><b>{SHORT.format(new Date(`${d}T12:00:00Z`)).split(" ")[0]}</b>{SHORT.format(new Date(`${d}T12:00:00Z`)).split(" ")[1]}</li>)}
                  </ol>
                  <p>If a session is called off for weather, Futprep tells you on WhatsApp and in class updates.</p>
                </details>
              )}

              <ul className="v4-facts">
                <li><b>Small groups</b>Places are set by the coaches on the field.</li>
                <li><b>Pay Futprep directly</b>Bank transfer or cash at the field. No cards.</li>
                <li><b>Health notes stay private</b>Seen only by Futprep&rsquo;s coaches.</li>
                <li><b>Free taster</b><a href="/futprep/trial">Try a session first</a>.</li>
              </ul>

              <div className="v4-box v4-faq">
                <details><summary>What should my child bring?</summary><p>Water, and trainers or football boots. For the youngest group, a grown-up who&rsquo;s happy to join in.</p></details>
                <details><summary>How do I pay?</summary><p>By bank transfer to Futprep with your reference, or in cash at the field. A coach marks it paid when the money arrives. There&rsquo;s no card payment.</p></details>
                <details><summary>Can we try a session first?</summary><p>Yes: <a href="/futprep/trial">book a free taster</a> before you pay for the term.</p></details>
              </div>
            </>
          )}
          <p className="v4-note">Need the longer form (emergency contact, pickup names)? <a href="/futprep/register?flow=classic">Use the full registration</a>.</p>
        </div>
      )}

      {step === "who" && (
        <form className="v4-screen v4-who" key="who" onSubmit={submit} noValidate>
          <h1 className="v4-title">Who&rsquo;s <em>playing?</em></h1>
          <fieldset>
            <legend>You</legend>
            <label><span>Your name *</span><input value={parent.name} autoComplete="name" onChange={(e) => setParent({ ...parent, name: e.target.value })} className={family === "filled" && parent.name ? "is-filled" : ""} /></label>
            <label><span>WhatsApp *</span><PhoneInput value={parent.phone} onChange={(v) => setParent({ ...parent, phone: v })} required /></label>
            <label><span>Email <small>(optional: for a copy and class updates)</small></span><input type="email" inputMode="email" autoComplete="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} /></label>
          </fieldset>

          <fieldset>
            <legend>Who&rsquo;s playing</legend>
            {lines.map((l, i) => {
              const fits = l.child.dob ? classesForBirthday(l.child.dob, open) : [];
              const suggestion = fits.find((o) => left(o) > 0) ?? null;
              const ref = l.offer ?? suggestion;
              return (
                <div className="v4-kid" key={l.child.id}>
                  <div className="v4-kid-head">
                    <b>Child {i + 1}{l.offer ? ` · ${l.offer.name.replace(/^Futprep\s+/i, "")}` : ""}</b>
                    {i > 0 && <button type="button" onClick={() => setChildren((list) => list.filter((c) => c.id !== l.child.id))}>Remove</button>}
                  </div>
                  <label><span>Name *</span><input value={l.child.name} onChange={(e) => setChild(l.child.id, { name: e.target.value })} className={family === "filled" && l.child.name ? "is-filled" : ""} /></label>
                  <label><span>Birthday *</span><input type="date" value={l.child.dob} max={today} onChange={(e) => {
                    const dob = e.target.value;
                    const best = classesForBirthday(dob, open).find((o) => left(o) > 0);
                    setChild(l.child.id, best ? { dob, offerKey: offerKey(best) } : { dob });
                  }} className={family === "filled" && l.child.dob ? "is-filled" : ""} /></label>
                  {l.child.dob && ref && (
                    <p className="v4-suggest">
                      On {short(ref.termStartDate)} they&rsquo;ll be <b>{ageOnDay(l.child.dob, ref.termStartDate)}</b>
                      {suggestion ? <>, so <b>{suggestion.name.replace(/^Futprep\s+/i, "")}</b>.</> : <>. No open class fits that age: <a href={FUTPREP_SITE}>ask Futprep</a>.</>}
                      {suggestion && l.child.offerKey !== offerKey(suggestion) && <> <button type="button" onClick={() => setChild(l.child.id, { offerKey: offerKey(suggestion) })}>Switch to {suggestion.name.replace(/^Futprep\s+/i, "")}</button></>}
                    </p>
                  )}
                  <label><span>Class *</span>
                    <select value={l.child.offerKey} onChange={(e) => setChild(l.child.id, { offerKey: e.target.value })}>
                      <option value="">Pick a class</option>
                      {open.map((o) => <option key={offerKey(o)} value={offerKey(o)} disabled={left(o) === 0}>{o.name} · ages {o.ageLabel}{left(o) === 0 ? " · full" : ""}</option>)}
                    </select>
                  </label>
                  <label><span>Health notes <small>(optional, coaches only: allergies, asthma, anything they should know)</small></span><textarea rows={2} maxLength={1000} value={l.child.healthNotes} onChange={(e) => setChild(l.child.id, { healthNotes: e.target.value })} /></label>
                </div>
              );
            })}
            {children.length < MAX_CHILDREN && <button type="button" className="v4-add" onClick={addChild}><span aria-hidden="true">+</span> Add a brother or sister</button>}
          </fieldset>

          <fieldset>
            <legend>Pay</legend>
            {anyWeekly && (
              <div className="v4-seg" role="radiogroup" aria-label="How often">
                <label className={plan === "term" ? "is-on" : ""}><input type="radio" name="plan" checked={plan === "term"} onChange={() => setPlan("term")} /><b>The term</b><small>once</small></label>
                <label className={plan === "weekly" ? "is-on" : ""}><input type="radio" name="plan" checked={plan === "weekly"} onChange={() => setPlan("weekly")} /><b>Each session</b><small>as you go</small></label>
              </div>
            )}
            <div className="v4-seg" role="radiogroup" aria-label="How">
              {methods.map((m) => (
                <label key={m} className={method === m ? "is-on" : ""}><input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} /><b>{METHOD_LABEL[m]}</b><small>{m === "cash" ? "at the field" : "details next"}</small></label>
              ))}
            </div>
            <div className="v4-math" aria-live="polite">
              {lines.map((l, i) => l.offer && l.price && (
                <p key={l.child.id}><span>Child {i + 1} · {l.offer.name.replace(/^Futprep\s+/i, "")}</span><b>{l.price.eachCents !== null ? `${formatPriceCents(l.price.eachCents)} a session` : formatPriceCents(l.price.dueCents)}</b></p>
              ))}
              <p className="v4-total"><span>{plan === "weekly" && anyWeekly ? "Each session" : "To pay"}</span><b>{formatPriceCents(total)}</b></p>
              {plan === "term" && anyWeekly && (
                <small>{saving > 0 ? `Paying for the term saves ${formatPriceCents(saving)} on paying each session.` : "The term price is the sessions added up; pay whichever suits you."}</small>
              )}
            </div>
          </fieldset>

          <fieldset className="v4-pills">
            <legend>Photos and video for Futprep&rsquo;s socials *</legend>
            <label className={photo === "yes" ? "is-on" : ""}><input type="radio" name="photo" checked={photo === "yes"} onChange={() => setPhoto("yes")} />Yes, that&rsquo;s fine</label>
            <label className={photo === "no" ? "is-on" : ""}><input type="radio" name="photo" checked={photo === "no"} onChange={() => setPhoto("no")} />No photos or video</label>
          </fieldset>
          <label className="v4-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I&rsquo;m {children.length > 1 ? "these children's" : "this child's"} parent or guardian (or have their permission), and what I&rsquo;ve given is correct. I accept the normal risks of football, and I allow Futprep&rsquo;s coaches to give first aid and call emergency services if they need to. Futprep and PortPass may keep these details to run {children.length > 1 ? "their places" : "my child's place"}; the health notes are seen only by Futprep&rsquo;s coaches. I&rsquo;ll tell Futprep if anything changes. *</span>
          </label>
          <PrivacyNote about="registration" childDetails />
          {error && <p className="v4-error" role="alert">{error}</p>}
          <div className="v4-actions">
            <button type="button" className="v4-ghost" onClick={() => go("pick")}>← Back</button>
            <button type="submit" className="v4-cta" disabled={busy}>{busy ? "Sending…" : children.length > 1 ? `Register ${children.length} children` : "Register"}</button>
          </div>
          <p className="v4-note">Nothing is paid yet. You pay Futprep directly, and a coach marks it paid.</p>
        </form>
      )}

      {step === "done" && (
        <div className="v4-screen v4-done" key="done" aria-live="polite">
          <div className="v4-done-top">
            <div className="v4-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
            <h1 className="v4-title">You&rsquo;re <em>in.</em></h1>
            {outcomes.filter((o) => o.referenceCode).map((o) => (
              <div className="v4-ref" key={o.child.id}>
                <span>{firstName(o.child.name)} · {o.offer.name.replace(/^Futprep\s+/i, "")}</span>
                <strong>{o.referenceCode}</strong>
              </div>
            ))}
          </div>
          {outcomes.filter((o) => o.error).map((o) => (
            <p className="v4-error" role="alert" key={o.child.id}><b>{firstName(o.child.name)} wasn&rsquo;t registered:</b> {o.error}</p>
          ))}
          {outcomes.filter((o) => o.referenceCode).map((o) => {
            const first = termDates(o.offer).find((d) => d >= today);
            return (
              <div className="v4-card-flat" key={o.child.id}>
                <h2>{firstName(o.child.name)} · {o.offer.name.replace(/^Futprep\s+/i, "")}</h2>
                <dl>
                  <div><dt>To pay</dt><dd><b>{formatPriceCents(o.amountDueCents ?? 0)}</b>{o.offer.programType !== "camp" && plan === "weekly" ? " each session" : ""}</dd></div>
                  <div><dt>How</dt><dd>{howToPayLines((method || "cash") as V4PaymentMethod, howToPay, o.referenceCode!).map((line) => <span key={line}>{line} </span>)}</dd></div>
                  {first && <div><dt>First session</dt><dd>{long(first)} · {o.offer.programType === "camp" ? `${o.offer.dailyStartTime || o.offer.time}–${o.offer.dailyEndTime || o.offer.endTime}` : programTimeRange(o.offer)}</dd></div>}
                  <div><dt>Where</dt><dd>{o.offer.location} · <a href={mapsUrl(o.offer.location, o.offer.locationNote)} target="_blank" rel="noopener noreferrer">Map ↗</a></dd></div>
                </dl>
                <a className="v4-ghost" href={`/api/futprep/calendar/${encodeURIComponent(o.offer.slug)}/${o.offer.termId}.ics`}>Add all {termDates(o.offer).length} to my calendar</a>
              </div>
            );
          })}
          {parent.email.trim() ? (
            <div className="v4-account" role="note">
              <p><strong>Get class updates from the coaches.</strong> Sign in with {parent.email.trim()} to see the next session, what&rsquo;s owed and every update in one place. It&rsquo;s free; no password.</p>
              <a className="v4-cta" href={`/signup?as=customer&email=${encodeURIComponent(parent.email.trim())}&name=${encodeURIComponent(parent.name.trim())}&next=${encodeURIComponent("/account")}`}>Sign in for class updates</a>
            </div>
          ) : (
            <p className="v4-note" role="note"><strong>Want class updates from the coaches?</strong> They go to the email on the registration. Message Futprep on WhatsApp with the reference and your email, then sign in to PortPass with that email.</p>
          )}
          <p className="v4-note">{parent.email.trim() ? `A copy is on its way to ${parent.email.trim()}.` : "No email given, so there's no copy: screenshot this page or write the references down."} Need to add an emergency contact or who may collect? Message Futprep on WhatsApp with the reference.</p>
          <div className="v4-actions">
            <a className="v4-cta" href={FUTPREP_SITE}>Back to Futprep</a>
            <button type="button" className="v4-ghost" onClick={another}>Add another child</button>
          </div>
        </div>
      )}
    </section>
  );
}
