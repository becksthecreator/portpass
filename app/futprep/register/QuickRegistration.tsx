"use client";

import { FormEvent, useRef, useState } from "react";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { recordGrowthEvent } from "@/app/_components/GrowthBeacon";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { PrivacyNote } from "@/app/_components/PrivacyNote";
import type { FutprepAvailability } from "@/db/registrations";
import { track } from "@/lib/analytics";
import { EMPTY_ATTRIBUTION, type Attribution } from "@/lib/attribution";
import { formatDateRange } from "@/lib/futprepTerms";
import { ageProblem, asksMonths, howToPayLines, mapsUrl, nextSessionDate, type QuickHowToPay } from "@/lib/quickRegistration";
import { programTimeRange } from "../config";
import { TapProgress } from "../TapProgress";

// Booking in three taps (brief 27, C). Pick: one card per open class. Who:
// the parent, the child, one health-notes box, how they will pay, one
// combined consent and the photo answer, all on one screen. Done: the
// reference, what is owed, how to pay, when and where, and whether a copy
// was emailed. No account is needed; one is offered at the end.
//
// The server keeps every rule (brief 12 ages and caps, the term window,
// duplicates); this screen only says the same things earlier. Brief 05's
// attribution travels as hidden values, as on the classic form.

type Offer = FutprepAvailability;
export type QuickPaymentMethod = "bank_transfer" | "cash";
const offerKey = (o: Pick<Offer, "programId" | "termId">) => `${o.programId}:${o.termId}`;
const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const longDate = (iso: string) => LONG.format(new Date(`${iso}T12:00:00Z`));
const YEARS = Array.from({ length: 13 }, (_, i) => i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i);

type Result = {
  referenceCode: string;
  registrationStatus?: string;
  amountDueCents: number;
  paymentFrequency?: "weekly" | "term";
  program: { name: string; day: string; time: string; endTime: string };
  term: { name: string; startDate: string; endDate: string; location: string };
};

type Form = {
  parentName: string; parentPhone: string; parentEmail: string;
  childName: string; ageYears: string; ageMonths: string; healthNotes: string;
  paymentFrequency: "weekly" | "term"; paymentMethod: QuickPaymentMethod | "";
  photoConsent: "yes" | "no" | ""; consent: boolean;
};

const EMPTY: Form = { parentName: "", parentPhone: "", parentEmail: "", childName: "", ageYears: "", ageMonths: "0", healthNotes: "", paymentFrequency: "weekly", paymentMethod: "", photoConsent: "", consent: false };
const METHOD_LABEL: Record<QuickPaymentMethod, string> = { bank_transfer: "Bank transfer", cash: "Cash at the field" };

function schedule(o: Offer): string {
  if (o.programType === "camp") return `${formatDateRange(o.termStartDate, o.termEndDate)} · ${o.dailyStartTime || o.time}–${o.dailyEndTime || o.endTime}`;
  return `${o.day}s ${programTimeRange(o)} · ${o.termName} from ${longDate(o.termStartDate)}`;
}

function price(o: Offer): string {
  if (o.programType === "camp") return `${formatPriceCents(o.termFeeCents)} for the camp`;
  return `${formatPriceCents(o.weeklyFeeCents)} per session · ${formatPriceCents(o.termFeeCents)} for the term`;
}

export function QuickRegistration({ offers, attribution = EMPTY_ATTRIBUTION, initialOfferKey = null, howToPay, methods, closedNotice = null, today }: {
  offers: Offer[]; attribution?: Attribution; initialOfferKey?: string | null;
  // From the business's payment settings (brief 17): last four digits only.
  howToPay: QuickHowToPay | null; methods: QuickPaymentMethod[];
  closedNotice?: string | null; today: string;
}) {
  const preselected = initialOfferKey && offers.some((o) => offerKey(o) === initialOfferKey) ? initialOfferKey : "";
  const [chosen, setChosen] = useState(preselected);
  const [step, setStep] = useState<1 | 2 | 3>(preselected ? 2 : 1);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(false);
  const offer = offers.find((o) => offerKey(o) === chosen) ?? null;
  const set = <K extends keyof Form>(field: K, value: Form[K]) => setForm((f) => ({ ...f, [field]: value }));
  const withMonths = offer ? asksMonths(offer) : false;
  const ageMonths = form.ageYears === "" ? Number.NaN : Number(form.ageYears) * 12 + (withMonths ? Number(form.ageMonths) : 0);

  function pick(o: Offer) {
    setChosen(offerKey(o));
    setError("");
    setStep(2);
    // "Started registering" (brief 05): the business, never the parent.
    if (!started.current) {
      started.current = true;
      track("register_start", { org: "futprep" });
      recordGrowthEvent("register_start");
    }
    window.scrollTo(0, 0);
  }

  function problem(): string | null {
    if (!offer) return "Pick a class first.";
    if (!form.parentName.trim() || !form.parentPhone.trim()) return "Add your name and phone number.";
    if (form.parentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parentEmail.trim())) return "That email address doesn't look right. Leave it blank if you'd rather not give one.";
    if (!form.childName.trim()) return "Add your child's name.";
    const age = ageProblem(offer, ageMonths, today);
    if (age) return age;
    if (!form.paymentMethod) return "Choose how you'll pay.";
    if (!form.photoConsent) return "Choose Yes or No for photos and video.";
    if (!form.consent) return "Tick the consent box to register.";
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = problem();
    if (message || !offer) return setError(message ?? "Pick a class first.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/futprep/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "quick",
          parentName: form.parentName.trim(),
          parentPhone: form.parentPhone,
          parentEmail: form.parentEmail.trim(),
          childName: form.childName.trim(),
          childAgeMonths: ageMonths,
          healthNotes: form.healthNotes.trim(),
          programSlug: offer.slug,
          termId: offer.termId,
          paymentFrequency: offer.programType === "camp" ? "term" : form.paymentFrequency,
          paymentMethod: form.paymentMethod,
          photoConsent: form.photoConsent,
          consentAccepted: true,
          ...attribution,
        }),
      });
      const data = (await response.json()) as { registration?: Result; error?: string };
      if (!response.ok || !data.registration) throw new Error(data.error ?? "We couldn't complete the registration.");
      setResult(data.registration);
      setStep(3);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't complete the registration.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Done ------------------------------------------------------------------------
  if (step === 3 && result && offer) {
    const first = form.childName.trim().split(/\s+/)[0] || "Your child";
    const next = nextSessionDate(offer, today);
    const method = (form.paymentMethod || "cash") as QuickPaymentMethod;
    const plan = offer.programType === "camp" ? "Camp fee" : form.paymentFrequency === "term" ? "Full term" : "Per session";
    return (
      <section className="tap-screen tap-done" aria-live="polite">
        <TapProgress step={3} />
        <h1>{first} is on the list.</h1>
        <p>Registration received. Nothing is paid yet: you pay Futprep directly, and a coach marks it paid.</p>
        <div className="tap-ref"><small>Your reference</small><strong>{result.referenceCode}</strong><span>Keep it: it is how Futprep finds this registration.</span></div>
        <dl className="tap-facts">
          <div>
            <dt>What you owe</dt>
            <dd><strong>{formatPriceCents(result.amountDueCents)}</strong> · {plan}{offer.programType !== "camp" && form.paymentFrequency === "weekly" ? `, ${formatPriceCents(offer.weeklyFeeCents)} each Saturday` : ""}</dd>
          </div>
          <div>
            <dt>How to pay · {METHOD_LABEL[method]}</dt>
            <dd>{howToPayLines(method, howToPay, result.referenceCode).map((line) => <p key={line}>{line}</p>)}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd><strong>{next ? longDate(next) : result.term.name}</strong><p>{offer.programType === "camp" ? `${offer.dailyStartTime || offer.time}–${offer.dailyEndTime || offer.endTime} each day` : `${programTimeRange(offer)}, every ${offer.day} until ${longDate(offer.termEndDate)}`}</p></dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd><strong>{offer.location}</strong>{offer.locationNote && <p>{offer.locationNote}</p>}<p><a href={mapsUrl(offer.location, offer.locationNote)} target="_blank" rel="noopener noreferrer">Open in maps ↗</a></p></dd>
          </div>
        </dl>
        <p className="tap-note">{form.parentEmail.trim() ? `A copy is on its way to ${form.parentEmail.trim()}.` : "You didn't give an email, so there's no copy to send: screenshot this page or write the reference down."}</p>
        <p className="tap-note">Need to add an emergency contact, who may collect {first}, or change the health notes? Message Futprep on WhatsApp with the reference and a coach will add it.</p>
        {form.parentEmail.trim() && <p className="tap-note">Want your bookings in one place? <a href="/login">Create a free PortPass account</a> with the same email; it&rsquo;s optional.</p>}
        <div className="tap-actions">
          <a className="tap-button" href="/sports-fitness/futprep-athletics">Back to Futprep</a>
          <button type="button" className="tap-back" onClick={() => { setResult(null); setForm({ ...EMPTY, parentName: form.parentName, parentPhone: form.parentPhone, parentEmail: form.parentEmail }); setStep(1); window.scrollTo(0, 0); }}>Register another child</button>
        </div>
      </section>
    );
  }

  // ---- Who -------------------------------------------------------------------------
  if (step === 2 && offer) {
    return (
      <section className="tap-screen">
        <TapProgress step={2} />
        <h1>Who&rsquo;s playing?</h1>
        <p>One screen, then you&rsquo;re done. Fields marked * are needed.</p>
        <div className="tap-chosen">
          <div><strong>{offer.name}</strong><br /><small>{schedule(offer)}</small></div>
          <button type="button" onClick={() => { setStep(1); setError(""); }}>Change</button>
        </div>
        <form className="tap-form" onSubmit={submit} noValidate>
          <h2 className="tap-step"><span>You</span>Parent or guardian</h2>
          <label><span>Your name *</span><input value={form.parentName} autoComplete="name" onChange={(e) => set("parentName", e.target.value)} /></label>
          <div className="tap-two">
            <label><span>Phone *</span><PhoneInput value={form.parentPhone} onChange={(v) => set("parentPhone", v)} required /></label>
            <label><span>Email <small>(optional, for a copy)</small></span><input type="email" value={form.parentEmail} autoComplete="email" inputMode="email" onChange={(e) => set("parentEmail", e.target.value)} /></label>
          </div>

          <h2 className="tap-step"><span>Kid</span>Your child</h2>
          <label><span>Child&rsquo;s name *</span><input value={form.childName} onChange={(e) => set("childName", e.target.value)} /></label>
          <div className="tap-age">
            <label><span>Age *</span>
              <select value={form.ageYears} onChange={(e) => set("ageYears", e.target.value)}>
                <option value="">Years</option>
                {YEARS.map((y) => <option key={y} value={y}>{y} {y === 1 ? "year" : "years"}</option>)}
              </select>
            </label>
            {withMonths && (
              <label><span>and months</span>
                <select value={form.ageMonths} onChange={(e) => set("ageMonths", e.target.value)}>
                  {MONTHS.map((m) => <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="tap-note">{offer.name} is for ages {offer.ageLabel}{offer.termStartDate > today ? `, counted on ${longDate(offer.termStartDate)}` : ""}.</p>
          <label><span>Health notes <small>(allergies, medical conditions, medication, anything the coaches should know; leave blank if none)</small></span><textarea value={form.healthNotes} rows={3} maxLength={1000} onChange={(e) => set("healthNotes", e.target.value)} /></label>

          <h2 className="tap-step"><span>$</span>Paying</h2>
          {offer.programType !== "camp" && (
            <fieldset className="tap-pills">
              <legend>Pay *</legend>
              <label className={`tap-pill ${form.paymentFrequency === "weekly" ? "is-selected" : ""}`}><input type="radio" name="plan" checked={form.paymentFrequency === "weekly"} onChange={() => set("paymentFrequency", "weekly")} />Each Saturday<small>{formatPriceCents(offer.weeklyFeeCents)} per session</small></label>
              <label className={`tap-pill ${form.paymentFrequency === "term" ? "is-selected" : ""}`}><input type="radio" name="plan" checked={form.paymentFrequency === "term"} onChange={() => set("paymentFrequency", "term")} />The whole term<small>{formatPriceCents(offer.termFeeCents)}</small></label>
            </fieldset>
          )}
          <fieldset className="tap-pills">
            <legend>How *</legend>
            {methods.map((m) => (
              <label key={m} className={`tap-pill ${form.paymentMethod === m ? "is-selected" : ""}`}><input type="radio" name="method" checked={form.paymentMethod === m} onChange={() => set("paymentMethod", m)} />{METHOD_LABEL[m]}<small>{m === "cash" ? "on the day" : "details on the next screen"}</small></label>
            ))}
          </fieldset>

          <h2 className="tap-step"><span>OK</span>Consent</h2>
          <fieldset className="tap-pills">
            <legend>Photos and video of {form.childName.trim().split(/\s+/)[0] || "your child"} for Futprep&rsquo;s socials *</legend>
            <label className={`tap-pill ${form.photoConsent === "yes" ? "is-selected" : ""}`}><input type="radio" name="photo" checked={form.photoConsent === "yes"} onChange={() => set("photoConsent", "yes")} />Yes, that&rsquo;s fine</label>
            <label className={`tap-pill ${form.photoConsent === "no" ? "is-selected" : ""}`}><input type="radio" name="photo" checked={form.photoConsent === "no"} onChange={() => set("photoConsent", "no")} />No photos or video</label>
          </fieldset>
          <label className="tap-consent">
            <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span>I&rsquo;m this child&rsquo;s parent or guardian (or have their permission), and what I&rsquo;ve given is correct. I accept the normal risks of football, and I allow Futprep&rsquo;s coaches to give first aid and call emergency services if they need to. Futprep and PortPass may keep these details to run my child&rsquo;s place; the health notes are seen only by Futprep&rsquo;s coaches. I&rsquo;ll tell Futprep if anything changes. *</span>
          </label>
          <PrivacyNote about="registration" childDetails />
          {error && <p className="tap-error" role="alert">{error}</p>}
          <div className="tap-actions">
            <button type="button" className="tap-back" onClick={() => { setStep(1); setError(""); }}>← Back</button>
            <button type="submit" className="tap-submit" disabled={busy}>{busy ? "Sending…" : "Register →"}</button>
          </div>
        </form>
      </section>
    );
  }

  // ---- Pick ------------------------------------------------------------------------
  return (
    <section className="tap-screen">
      <TapProgress step={1} />
      <h1>Pick a class.</h1>
      <p>Saturdays at Lyford Cay. Three taps and your child is registered; you pay Futprep directly, by bank transfer or cash at the field.</p>
      {offers.length === 0 ? (
        <p className="tap-closed">{closedNotice ?? "Nothing is open for registration right now."} Private sessions run all year: <a href="/futprep/book">book one with a coach</a>.</p>
      ) : (
        <ul className="tap-cards">
          {offers.map((o) => {
            const full = o.spotsRemaining === 0;
            const body = (
              <>
                <span className="tap-ages">Ages {o.ageLabel}{o.programType === "camp" ? " · Camp" : ""}</span>
                <strong>{o.name}</strong>
                <span>{schedule(o)}</span>
                <span>{o.location}</span>
                <span className="tap-price">{price(o)}</span>
                <span className="tap-go">{full ? "Full · join the waitlist →" : `${o.spotsRemaining} ${o.spotsRemaining === 1 ? "spot" : "spots"} left · Pick →`}</span>
              </>
            );
            return (
              <li key={offerKey(o)}>
                {full
                  ? <a className="tap-card is-full" href={`/futprep/register?flow=classic&program=${encodeURIComponent(o.slug)}&term=${o.termId}`}>{body}</a>
                  : <button type="button" className="tap-card" onClick={() => pick(o)}>{body}</button>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="tap-note">Need the longer form (emergency contact, pickup names, a free taster)? <a href="/futprep/register?flow=classic">Use the full registration</a>.</p>
    </section>
  );
}
