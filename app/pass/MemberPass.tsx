"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearStoredPass, currentCode, readStoredPass, storePass, type StoredPass } from "@/lib/memberPassClient";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "ready"; pass: StoredPass }
  | { kind: "unavailable"; message: string };

// Twelve minutes of codes arrive each time; ask again once fewer than
// eleven are left, so there are always ten in hand if the signal goes.
const REFRESH_WHEN_LEFT_MS = 11 * 60 * 1000;
// With no signal, try again this often rather than on every tick.
const RETRY_EVERY_MS = 15 * 1000;

function memberSince(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "America/Nassau" });
}

// The pass: first name, member number, "member since" and the code for
// this half minute. While there is a signal it keeps ten minutes of codes
// in hand; with none, it shows the ones it has until they run out.
export function MemberPass() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const fetching = useRef(false);
  const lastAttempt = useRef(0);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    lastAttempt.current = Date.now();
    try {
      const res = await fetch("/api/account/pass", { cache: "no-store" });
      if (res.status === 401) {
        clearStoredPass();
        setState({ kind: "signed-out" });
        return;
      }
      const data = (await res.json().catch(() => null)) as (Omit<StoredPass, "offset"> & { now: number; error?: string }) | null;
      if (!res.ok || !data || !Array.isArray(data.codes)) {
        setState((current) => (current.kind === "ready" ? current : { kind: "unavailable", message: data?.error ?? "Your Member Pass isn't ready yet. Try again in a moment." }));
        return;
      }
      // The server's clock decides which code is current: a phone whose
      // clock is a few minutes out would otherwise show the wrong one.
      const pass: StoredPass = { firstName: data.firstName, memberNumber: data.memberNumber, memberSince: data.memberSince, codes: data.codes, offset: data.now - Date.now() };
      storePass(pass);
      setOffline(false);
      setState({ kind: "ready", pass });
    } catch {
      // No signal: keep showing what is in hand.
      setOffline(true);
      setState((current) => {
        if (current.kind === "ready") return current;
        const stored = readStoredPass();
        return stored ? { kind: "ready", pass: stored } : { kind: "unavailable", message: "You're offline, and this phone has no saved pass yet. Open your Member Pass once with a signal and it will work offline for ten minutes." };
      });
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    const stored = readStoredPass();
    if (stored) setState({ kind: "ready", pass: stored });
    void refresh();
    const tick = setInterval(() => setNow(Date.now()), 500);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  const pass = state.kind === "ready" ? state.pass : null;
  const serverNow = pass ? now + pass.offset : now;
  const showing = pass ? currentCode(pass.codes, serverNow) : null;
  const lastUntil = pass && pass.codes.length > 0 ? pass.codes[pass.codes.length - 1].until : 0;

  // Top up before the codes in hand run out.
  useEffect(() => {
    if (pass && lastUntil - serverNow < REFRESH_WHEN_LEFT_MS && Date.now() - lastAttempt.current > RETRY_EVERY_MS) void refresh();
  }, [pass, lastUntil, serverNow, refresh]);

  if (state.kind === "loading") {
    return <section className="pass-card" aria-busy="true"><p className="pass-wait">Opening your Member Pass…</p></section>;
  }

  if (state.kind === "signed-out") {
    return (
      <section className="pass-card pass-card-out">
        <span className="pass-eyebrow">PortPass Member Pass</span>
        <h1>Sign in to see your pass.</h1>
        <p>A PortPass account is free. Your Member Pass unlocks member perks at the businesses that offer one.</p>
        <div className="pass-actions">
          <Link className="primary-button" href="/login?next=%2Fpass">Sign in</Link>
          <Link className="pass-secondary" href="/signup?as=customer&next=%2Fpass&utm_source=pass">Sign up free</Link>
        </div>
      </section>
    );
  }

  if (state.kind === "unavailable" || !pass) {
    return (
      <section className="pass-card pass-card-out">
        <span className="pass-eyebrow">PortPass Member Pass</span>
        <h1>Not ready yet.</h1>
        <p>{state.kind === "unavailable" ? state.message : ""}</p>
        <div className="pass-actions"><button className="primary-button" type="button" onClick={() => void refresh()}>Try again</button></div>
      </section>
    );
  }

  const secondsLeft = showing ? Math.max(0, Math.ceil((showing.until - serverNow) / 1000)) : 0;
  const since = memberSince(pass.memberSince);

  return (
    <section className="pass-card" aria-label="Your Member Pass">
      <div className="pass-card-head">
        <span className="pass-eyebrow">PortPass Member Pass</span>
        <span className="pass-chip">Member</span>
      </div>
      <h1 className="pass-name">{pass.firstName}</h1>
      <p className="pass-number" aria-label={`Member number ${pass.memberNumber.split("").join(" ")}`}>{pass.memberNumber}</p>
      {since && <p className="pass-since">Member since {since}</p>}

      {showing ? (
        <div className="pass-code-box">
          <span className="pass-code-label">Code</span>
          <span className="pass-code" aria-live="off">{showing.code.slice(0, 3)} {showing.code.slice(3)}</span>
          <span className="pass-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (secondsLeft / 30) * 100)}%` }} /></span>
          <span className="pass-code-note">Changes in {secondsLeft}s. Staff type your member number and this code.</span>
        </div>
      ) : (
        <div className="pass-code-box pass-code-box-out">
          <span className="pass-code-label">Code</span>
          <span className="pass-code-note">The saved codes have run out. Connect to get a fresh one.</span>
          <button className="primary-button" type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      )}

      {offline && showing && <p className="pass-offline" role="status">No signal. This pass keeps working for {Math.max(1, Math.ceil((lastUntil - serverNow) / 60000))} more minutes.</p>}
      <p className="pass-foot">Show this at the counter. The business sees only your first name and member number.</p>
    </section>
  );
}
