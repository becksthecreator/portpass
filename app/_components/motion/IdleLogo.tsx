"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motionEnabled, tokenMs } from "@/lib/motion/client";

// A featured listing's logo mark, idling (brief 22, M4): every --dur-idle
// one of the marks on screen gives a small bounce over --dur-hero
// (transform only, in lib/motion/public.css). One at a time across the
// whole page, only while in view, only on a category list, only for a
// featured listing with a vector logo (the caller decides that). Under
// reduced motion or the kill switch nothing is scheduled at all.
const visible = new Set<HTMLElement>();
let timer: number | null = null;
let cursor = 0;

function tick() {
  const marks = Array.from(visible);
  if (!marks.length) {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    return;
  }
  cursor = (cursor + 1) % marks.length;
  const mark = marks[cursor];
  mark.setAttribute("data-idle", "");
  window.setTimeout(() => mark.removeAttribute("data-idle"), tokenMs("--dur-hero", 900));
}

function schedule() {
  if (timer === null && visible.size) timer = window.setInterval(tick, tokenMs("--dur-idle", 5000));
}

export function IdleLogo({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionEnabled() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // isIntersecting is true at any overlap; a mark idles only once
          // half of it is on screen.
          if (entry.intersectionRatio >= 0.5) {
            visible.add(el);
            schedule();
          } else {
            visible.delete(el);
            el.removeAttribute("data-idle");
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      visible.delete(el);
      el.removeAttribute("data-idle");
    };
  }, []);

  return (
    <span ref={ref} className="idle-logo">
      {children}
    </span>
  );
}
