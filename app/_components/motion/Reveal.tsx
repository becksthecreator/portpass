"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motionEnabled } from "@/lib/motion/client";

// A scroll reveal (brief 22, M1). The element renders on the server with
// data-reveal="<variant>"; lib/motion/motion.css holds it at its start
// state only while motion is on and JavaScript is running, and once 15% of
// it is in view this adds data-in and the stylesheet lets it settle. Once:
// an element that has arrived is never watched again, so nothing replays
// on the way back up.
//
//   variant  fade (opacity only), rise (16px up), scale (from .96)
//   delay    0 to 6 steps of 60 ms, for a few elements arriving in turn
//   stagger  the element stays put; its direct children arrive 60 ms
//            apart, six steps at most (the seventh and beyond come with the
//            sixth). Use it on a list or a grid, never on more than one
//            level at once.
//
// One IntersectionObserver serves every Reveal on the page. If motion is
// off (the kill switch, or the visitor's reduced-motion preference) the
// element is marked in view at once; the stylesheet shows the final state
// anyway, so this only keeps the two in step.
export type RevealVariant = "fade" | "rise" | "scale";
export type RevealTag = "div" | "section" | "ul" | "ol" | "li" | "p" | "span" | "header" | "figure";

let shared: IntersectionObserver | null = null;

function observer(): IntersectionObserver {
  if (!shared) {
    shared = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // In view, or already scrolled past (a jump to an anchor before
          // the script ran): shown, and not watched again.
          const scrolledPast = entry.boundingClientRect.bottom < 0;
          if (!entry.isIntersecting && !scrolledPast) continue;
          entry.target.setAttribute("data-in", "");
          shared?.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
  }
  return shared;
}

export function Reveal({
  as = "div",
  variant = "rise",
  delay = 0,
  stagger = false,
  className,
  id,
  children,
}: {
  as?: RevealTag;
  variant?: RevealVariant;
  delay?: number;
  stagger?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!motionEnabled() || typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-in", "");
      return;
    }
    const io = observer();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  // The tag is chosen at render time; the ref is typed as a div's, which
  // every tag here satisfies for what the effect reads.
  const Tag = as as "div";
  const step = Math.min(6, Math.max(0, Math.round(delay)));
  return (
    <Tag ref={ref} id={id} className={className} data-reveal={variant} data-delay={step ? String(step) : undefined} data-stagger={stagger ? "" : undefined}>
      {children}
    </Tag>
  );
}
