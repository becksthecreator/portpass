"use client";

import { useEffect, useRef, useState } from "react";

// The moving band (Signal, 22 Nov 2026, motion 07): two rows of big words
// slide in opposite directions under the hero. CSS runs the loop
// (app/_components/signal/signal.css); this component only pauses it, from
// the button, and while the band is off screen. Under reduced motion and
// the kill switch it is one still row and the button is hidden.
const ROW_A = ["Bookings", "Payments", "Staff", "Marketing"];
const ROW_B = ["We look", "We fix", "We run it with you"];

function Row({ words, copies }: { words: string[]; copies: number }) {
  const items: string[] = [];
  for (let i = 0; i < copies; i += 1) items.push(...words);
  return (
    <>
      {items.map((word, i) => (
        <span className="sg-band-item" key={`${word}-${i}`}>
          {word}
          <i className="sg-band-dot" />
        </span>
      ))}
    </>
  );
}

export function SignalBand() {
  const ref = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.removeAttribute("data-offscreen");
      else el.setAttribute("data-offscreen", "");
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="sg-band" aria-label="What we do" data-paused={paused ? "" : undefined}>
      <p className="sr-only">Bookings, payments, staff and marketing. We look, we fix, we run it with you.</p>
      <div className="sg-band-rows" aria-hidden="true">
        <div className="sg-band-row sg-band-row-a">
          <div className="sg-band-track">
            <Row words={ROW_A} copies={4} />
          </div>
        </div>
        <div className="sg-band-row sg-band-row-b">
          <div className="sg-band-track">
            <Row words={ROW_B} copies={4} />
          </div>
        </div>
      </div>
      <button type="button" className="sg-band-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
        {paused ? "Play" : "Pause"}
        <span className="sr-only"> the moving words</span>
      </button>
    </section>
  );
}
