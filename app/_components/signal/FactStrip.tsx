"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { motionEnabled } from "@/lib/motion/client";

// The facts strip (Signal, 22 Nov 2026, motion 08). Each number is built as
// a column of digits sitting on its final value, so the page always shows
// the true number. The roll (digits rolling up one after another, then a
// bar under each) is off for now: per the plan Bex approved, these stay
// still until Futprep's real Term 2 figures exist and Alex OKs them. To
// look at the roll on a preview, add ?roll=1 to the address; it rolls the
// same true numbers and changes nothing else.
type Fact = { value: string; label: string };

const FACTS: Fact[] = [
  { value: "3", label: "ways to pay: cash, bank transfer and Kanoo" },
  { value: "$0", label: "for the first look" },
];

function Value({ value }: { value: string }) {
  return (
    <span className="sg-fact-value">
      <span className="sr-only">{value}</span>
      <span className="sg-fact-digits" aria-hidden="true">
        {value.split("").map((ch, i) =>
          /\d/.test(ch) ? (
            <span className="sg-col" key={i} style={{ "--sg-d": ch, "--sg-s": ch === "0" ? 9 : 0 } as CSSProperties}>
              <span className="sg-col-in">
                {"0123456789".split("").map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={i}>{ch}</span>
          ),
        )}
      </span>
    </span>
  );
}

export function FactStrip({ roll = false }: { roll?: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionEnabled()) return;
    let wanted = roll;
    try {
      wanted = wanted || new URLSearchParams(window.location.search).get("roll") === "1";
    } catch {
      // No URL API: stay still.
    }
    if (!wanted) return;
    el.setAttribute("data-roll", "");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.setAttribute("data-in", "");
        io.disconnect();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [roll]);

  return (
    <section ref={ref} className="sg-facts" aria-label="PortPass in numbers">
      <ul className="sg-facts-list">
        {FACTS.map((fact, i) => (
          <li key={fact.label} style={{ "--sg-i": i } as CSSProperties}>
            <Value value={fact.value} />
            <span className="sg-fact-label">{fact.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
