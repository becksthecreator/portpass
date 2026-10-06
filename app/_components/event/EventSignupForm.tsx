"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PhoneInput } from "@/app/_components/PhoneInput";
import { PrivacyNote } from "@/app/_components/PrivacyNote";
import { track } from "@/lib/analytics";
import { addPending, OFFLINE_KEY, readPending, type PendingSignup } from "@/lib/eventSignup";

type Section = { slug: string; name: string };

const blank = { name: "", businessName: "", whatsapp: "", section: "", instagram: "", whatsappConsent: false };

function loadPending(): PendingSignup[] {
  try {
    return readPending(window.localStorage.getItem(OFFLINE_KEY));
  } catch {
    return [];
  }
}

function storePending(list: PendingSignup[]) {
  try {
    if (list.length) window.localStorage.setItem(OFFLINE_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(OFFLINE_KEY);
  } catch {
    // storage blocked (private mode): nothing can wait; the form says so
  }
}

async function send(body: Record<string, unknown>): Promise<"sent" | "refused" | "offline"> {
  try {
    const response = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.ok) return "sent";
    // The server answered: it has it or refused it. Either way it is not
    // worth keeping on the phone (a 5xx is: the server may be back soon).
    return response.status >= 500 ? "offline" : "refused";
  } catch {
    return "offline";
  }
}

// The 30-second sign-up form at an event (brief 18, part C): name,
// business, WhatsApp, what you do, Instagram (optional) and one tick box.
// With no signal the submission waits in this browser and is sent when
// the phone is back online; it is removed from the phone once sent.
export function EventSignupForm({ event, sections }: { event: string; sections: Section[] }) {
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<"form" | "sent" | "waiting">("form");
  const [waiting, setWaiting] = useState(0);

  // Send anything that was waiting: on load, and whenever the phone says
  // it is back online.
  const flush = useCallback(async () => {
    let list = loadPending();
    for (const item of [...list]) {
      const outcome = await send(item.body);
      if (outcome === "offline") break;
      list = list.filter((pending) => pending.id !== item.id);
      storePending(list);
    }
    setWaiting(list.length);
    return list.length;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sends what was waiting in this browser's storage, on load
    void flush();
    const onOnline = () => {
      void flush().then((left) => {
        if (left === 0) setState((current) => (current === "waiting" ? "sent" : current));
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  function set<K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.businessName.trim() || !form.whatsapp.trim() || !form.section) return setError("Fill in your name, your business, your WhatsApp number and what you do.");
    setBusy(true);
    setError("");
    const body = { event, ...form };
    let outcome: "sent" | "refused" | "offline" = "offline";
    let refusal = "";
    try {
      const response = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.ok) outcome = "sent";
      else if (response.status < 500) {
        outcome = "refused";
        refusal = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "";
      }
    } catch {
      outcome = "offline";
    }
    setBusy(false);
    if (outcome === "refused") return setError(refusal || "We couldn't save that. Check the details and try again.");
    if (outcome === "offline") {
      const list = addPending(loadPending(), body, `${Date.now()}-${Math.round(performance.now())}`);
      storePending(list);
      setWaiting(list.length);
      setState("waiting");
    } else {
      track("event_signup", { event });
      setState("sent");
    }
    setForm(blank);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (state !== "form") {
    return (
      <section className="confirmation" aria-live="polite">
        <span className="confirmation-mark">✓</span>
        <div className="eyebrow"><span className="eyebrow-dot" />{state === "sent" ? "Got it" : "Saved on this phone"}</div>
        <h2>{state === "sent" ? "Thank you. We’ll be in touch." : "Thank you. It will send when you’re back online."}</h2>
        <p>{state === "sent" ? "One of us will message you about your page. Nothing is sent automatically, and there is nothing to pay to talk to us." : "There is no signal right now. Your details are kept on this phone only and are sent the moment it is back online. Keep this page open, or open it again later."}</p>
        <div className="form-submit">
          <button className="primary-button" type="button" onClick={() => setState("form")}>Sign up another business</button>
          <Link href="/demo">Try a demo business →</Link>
        </div>
      </section>
    );
  }

  return (
    <form className="application-form" onSubmit={submit}>
      {waiting > 0 && <p className="join-waiting" role="status">{waiting === 1 ? "1 sign-up is" : `${waiting} sign-ups are`} saved on this phone and will send when it is back online.</p>}
      <div className="form-grid">
        <label><span>Your name *</span><input name="name" autoComplete="name" required maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span>Business name *</span><input name="businessName" autoComplete="organization" required maxLength={150} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} /></label>
        <label><span>WhatsApp number *</span><PhoneInput name="whatsapp" required value={form.whatsapp} onChange={(v) => set("whatsapp", v)} /></label>
        <label>
          <span>What you do *</span>
          <select name="section" required value={form.section} onChange={(e) => set("section", e.target.value)}>
            <option value="">Choose one</option>
            {sections.map((section) => <option key={section.slug} value={section.slug}>{section.name}</option>)}
          </select>
        </label>
        <label className="full-field"><span>Instagram (optional)</span><input name="instagram" placeholder="@yourbusiness" maxLength={60} autoCapitalize="none" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} /></label>
        <label className="full-field join-consent">
          <input type="checkbox" checked={form.whatsappConsent} onChange={(e) => set("whatsappConsent", e.target.checked)} />
          <span>PortPass can message me on WhatsApp about my page</span>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit">
        <p>Takes 30 seconds. No account, no card.</p>
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Sending…" : "Sign me up →"}</button>
      </div>
      <PrivacyNote />
    </form>
  );
}
