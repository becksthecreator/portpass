"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { countdownParts } from "@/lib/shop/rules";

const pad = (n: number) => String(n).padStart(2, "0");

// Counts down to a drop's opening (brief 15). The server renders the
// opening time itself (fallback), the browser ticks; at zero the page is
// refreshed once so the server decides what is open now.
export function Countdown({ target, label, fallback }: { target: string; label: string; fallback: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the server renders the opening time; the clock starts in the browser
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const left = now === null ? null : Date.parse(target) - now;
  useEffect(() => {
    if (left !== null && left <= 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [left, router]);

  if (left === null) return <p className="shop-countdown"><span>{label}</span> <strong>{fallback}</strong></p>;
  if (left <= 0) return <p className="shop-countdown"><span>Opening now…</span></p>;
  const p = countdownParts(left);
  return (
    <p className="shop-countdown" role="timer" aria-label={`${label} ${fallback}`}>
      <span>{label}</span>
      <span className="shop-countdown-units" aria-hidden="true">
        {p.days > 0 && <b>{p.days}<small>d</small></b>}
        <b>{pad(p.hours)}<small>h</small></b>
        <b>{pad(p.minutes)}<small>m</small></b>
        <b>{pad(p.seconds)}<small>s</small></b>
      </span>
    </p>
  );
}
