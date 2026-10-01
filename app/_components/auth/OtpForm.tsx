"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { formatWait } from "@/lib/auth/sendErrors";
import { SECTIONS } from "@/lib/sections";
import { PhoneInput } from "../PhoneInput";

type Intent = "customer" | "business";

type SectionOption = { slug: string; name: string };

type Props = {
  mode: "login" | "signup";
  next?: string | null;
  initialIntent?: Intent | null;
  phoneEnabled?: boolean;
  // From the categories table via the page; the compiled list is only the
  // fallback for a caller that has nothing better.
  sections?: SectionOption[];
  // "Continue with Google" comes first (speed & sign-in brief, 29 Sept,
  // 2.2 and 2.7); the page builds the href with ?next= and ?mode=.
  google?: string | null;
  // A message from a failed Google round trip (?error=), shown at the top.
  notice?: string | null;
  // Guest-first (2.1): a confirmation screen's "Save this to a free
  // PortPass account" arrives with the email and name already known.
  initialEmail?: string;
  initialName?: string;
};

type Fields = { fullName: string; email: string; phone: string; businessName: string; section: string };

const CODE_LENGTH = 6;
// A pasted code may carry a stray digit or two (the Supabase setting was 8
// digits until 29 Sept); the box takes up to this many and says so when
// the length is wrong rather than silently truncating.
const PASTE_MAX = 8;

// One form for both doors and for sign-in. Step 1 collects what the door
// needs (sign-in: just the email) and asks for a code; step 2 is the code
// itself -- a single input styled as six boxes rather than six inputs, so
// iOS/Android one-time-code autofill and paste both land in one place.
export function OtpForm({ mode, next, initialIntent = null, phoneEnabled = false, sections, google = null, notice = null, initialEmail = "", initialName = "" }: Props) {
  const sectionOptions: SectionOption[] = sections ?? SECTIONS.map((s) => ({ slug: s.slug, name: s.name }));
  const [intent, setIntent] = useState<Intent | null>(mode === "login" ? "customer" : initialIntent);
  const [fields, setFields] = useState<Fields>({ fullName: initialName, email: initialEmail, phone: "", businessName: "", section: "" });
  const [step, setStep] = useState<"details" | "code">("details");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [noAccount, setNoAccount] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const verifying = useRef(false);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, string> = { email: fields.email.trim(), mode };
      if (mode === "signup" && intent) {
        payload.intent = intent;
        payload.fullName = fields.fullName.trim();
        payload.phone = fields.phone.trim();
        if (intent === "business") {
          payload.businessName = fields.businessName.trim();
          payload.section = fields.section;
        }
      }
      const res = await fetch("/api/auth/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; retryAfter?: number };
      if (!res.ok) {
        // A real wait (the app limits reset in minutes, Supabase's mailer
        // in an hour) drives the countdown; "no account" gets a sign-up link.
        if (typeof data.retryAfter === "number" && data.retryAfter > 0) setResendIn(Math.min(data.retryAfter, 3600));
        setNoAccount(data.code === "no_account");
        throw new Error(data.error ?? "We couldn’t send a code. Please try again.");
      }
      setNoAccount(false);
      setStep("code");
      setCode("");
      setResendIn(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t send a code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(token: string) {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.email.trim(), token, next: next ?? undefined, intent: intent ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; next?: string };
      if (!res.ok || !data.next) throw new Error(data.error ?? "That code didn’t work. Try again.");
      window.location.assign(data.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn’t work. Try again.");
      setCode("");
      codeRef.current?.focus();
      setBusy(false);
      verifying.current = false;
    }
  }

  function onDetails(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup") {
      if (!intent) {
        setError("Choose one of the two options above.");
        return;
      }
      if (!fields.fullName.trim()) {
        setError("Tell us your name.");
        return;
      }
      if (intent === "business" && (!fields.businessName.trim() || !fields.section)) {
        setError("Tell us your business name and which section it belongs in.");
        return;
      }
    }
    void sendCode();
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, PASTE_MAX);
    if (digits.length > CODE_LENGTH) {
      setCode("");
      setError(`The code is ${CODE_LENGTH} digits; that was ${digits.length}. Check the newest email and try again.`);
      return;
    }
    setError("");
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  }

  const waitLabel = resendIn > 0 ? formatWait(resendIn) : null;
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  if (step === "code") {
    return (
      <div className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" />Check your email</div>
        <h1>Enter the 6-digit code.</h1>
        <p className="auth-lead">We sent it to <strong>{fields.email.trim()}</strong>. It expires in a few minutes.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === CODE_LENGTH) void verify(code);
          }}
        >
          <label className="auth-code-label" htmlFor="otp-code">Sign-in code</label>
          <div className="auth-code" data-filled={code.length}>
            <input
              ref={codeRef}
              id="otp-code"
              className="auth-code-input"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={PASTE_MAX}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              disabled={busy}
              aria-describedby="otp-help"
            />
            <div className="auth-code-boxes" aria-hidden="true">
              {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                <span key={i} className={i < code.length ? "is-filled" : i === code.length ? "is-active" : ""}>{code[i] ?? ""}</span>
              ))}
            </div>
          </div>
          <p id="otp-help" className="auth-hint">Type or paste the code; it checks itself when all six digits are in.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="auth-actions">
            <button className="primary-button" type="submit" disabled={busy || code.length !== CODE_LENGTH}>{busy ? "Checking…" : "Continue →"}</button>
            <button className="auth-text-button" type="button" disabled={busy || resendIn > 0} onClick={() => void sendCode()}>
              {waitLabel ? `You can ask for a new code in ${waitLabel}` : "Send a new code"}
            </button>
          </div>
        </form>
        <p className="auth-alt">
          Wrong address?{" "}
          <button className="auth-link" type="button" onClick={() => { setStep("details"); setError(""); }}>Use a different email</button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      {mode === "signup" ? (
        <>
          <div className="eyebrow"><span className="eyebrow-dot" />Create your PortPass account</div>
          <h1>Which one are you?</h1>
          <div className="auth-doors" role="radiogroup" aria-label="Account type">
            <button type="button" role="radio" aria-checked={intent === "customer"} className={`auth-door${intent === "customer" ? " is-selected" : ""}`} onClick={() => setIntent("customer")}>
              <strong>I&rsquo;m booking or joining</strong>
              <span>Register a child, plan a wedding, book a session.</span>
            </button>
            <button type="button" role="radio" aria-checked={intent === "business"} className={`auth-door${intent === "business" ? " is-selected" : ""}`} onClick={() => setIntent("business")}>
              <strong>I run a business</strong>
              <span>Get your page, bookings and payments in one place.</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="eyebrow"><span className="eyebrow-dot" />Sign in</div>
          <h1>Sign in to PortPass.</h1>
          <p className="auth-lead">{google ? "Use Google, or we’ll email you a 6-digit code. No password to remember." : "We’ll send a 6-digit code. No password to remember."}</p>
        </>
      )}

      {notice && <p className="form-error" role="alert">{notice}</p>}

      {google && (mode === "login" || intent) && (
        <>
          <a className="auth-google" href={`${google}${google.includes("?") ? "&" : "?"}intent=${intent ?? ""}`} rel="nofollow">
            <span className="auth-google-mark" aria-hidden="true">G</span>
            Continue with Google
          </a>
          <div className="auth-divider" role="separator"><span>or continue with email</span></div>
        </>
      )}

      <form className="auth-form" onSubmit={onDetails}>
        {mode === "signup" && intent && (
          <label><span>Your name *</span><input autoComplete="name" required maxLength={120} value={fields.fullName} onChange={(e) => set("fullName", e.target.value)} /></label>
        )}
        <label><span>Email *</span><input type="email" inputMode="email" autoComplete="email" required maxLength={254} value={fields.email} onChange={(e) => set("email", e.target.value)} /></label>
        {mode === "signup" && intent && (
          <label><span>Phone (WhatsApp) {intent === "business" ? "*" : "(optional)"}</span><PhoneInput required={intent === "business"} value={fields.phone} onChange={(v) => set("phone", v)} /></label>
        )}
        {mode === "signup" && intent === "business" && (
          <>
            <label><span>Business name *</span><input autoComplete="organization" required maxLength={150} value={fields.businessName} onChange={(e) => set("businessName", e.target.value)} /></label>
            <label>
              <span>Section *</span>
              <select required value={fields.section} onChange={(e) => set("section", e.target.value)}>
                <option value="">Choose one</option>
                {sectionOptions.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
            {noAccount && mode === "login" && <> <Link href={signupHref}>Create one →</Link></>}
            {waitLabel && !noAccount && <> You can try again in {waitLabel}.</>}
          </p>
        )}
        <div className="auth-actions">
          <button className="primary-button" type="submit" disabled={busy || resendIn > 0 || (mode === "signup" && !intent)}>{busy ? "Sending…" : waitLabel ? `Wait ${waitLabel}` : google ? "Continue with email →" : "Send code →"}</button>
          {phoneEnabled && <button className="auth-text-button" type="button" disabled>Use my phone number instead</button>}
        </div>
      </form>

      <p className="auth-legal">By continuing you confirm you are 18 or older and agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>

      {mode === "login" ? (
        <>
          <p className="auth-alt">New here? You don&rsquo;t need an account to book. <Link href="/">Browse PortPass</Link>. Want one anyway? <Link href={signupHref}>Create an account</Link>.</p>
          <p className="auth-business-link"><Link href="/business">I run a business</Link></p>
        </>
      ) : (
        <p className="auth-alt">Already have an account? <Link href={loginHref}>Sign in</Link></p>
      )}
    </div>
  );
}
