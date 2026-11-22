"use client";

import { useEffect, useRef } from "react";
import { motionEnabled } from "@/lib/motion/client";

// From mess to order (Signal, 22 Nov 2026, motion 05). A tangled line runs
// through the three things Futprep did by hand, then straightens into one
// route to where it is now. With motion on, the line draws as the section
// scrolls up the screen and each stop lights as the line reaches it; a dot
// layer behind moves at a fifth of the speed. Without script, under reduced
// motion and with the kill switch, the line is fully drawn and every stop is
// lit: the HTML is the final state, and data-armed is what holds it back.
const STOPS = [
  { title: "Sign-ups in WhatsApp", note: "Every child registered by message, one parent at a time." },
  { title: "Payments tracked by hand", note: "Who paid, how and when, checked one by one." },
  { title: "Every question goes to the owner", note: "Times, prices and kit, all answered by one phone." },
  { title: "One place for it all", note: "Bookings, payments and parents in PortPass, and we run it with them." },
];
// Where along the whole line (0 to 1) each stop sits.
const AT = [0.12, 0.41, 0.7, 0.86];
const MESS = "M20 140 C 60 40, 100 200, 125 120 S 200 30, 240 150 S 330 210, 375 120 S 450 30, 500 150 S 590 200, 625 120";
const ORDER = "M625 120 H 975";

export function MessRoute() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionEnabled()) return;
    const mess = el.querySelector<SVGPathElement>(".sg-route-mess");
    const order = el.querySelector<SVGPathElement>(".sg-route-order");
    const stops = el.querySelectorAll<HTMLElement>("[data-stop]");
    if (!mess || !order) return;
    const lm = mess.getTotalLength();
    const lo = order.getTotalLength();
    const share = lm / (lm + lo);
    mess.style.strokeDasharray = `${lm}`;
    order.style.strokeDasharray = `${lo}`;
    el.setAttribute("data-armed", "");

    let raf = 0;
    let visible = false;
    const draw = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Starts when the top is 85% down the screen; done when the middle is at 45%.
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.4 + r.height / 2)));
      const pm = Math.min(1, p / share);
      const po = Math.min(1, Math.max(0, (p - share) / (1 - share)));
      mess.style.strokeDashoffset = `${(lm * (1 - pm)).toFixed(1)}`;
      order.style.strokeDashoffset = `${(lo * (1 - po)).toFixed(1)}`;
      // The pins on the line and the labels under it share the same four stops.
      stops.forEach((s, i) => s.toggleAttribute("data-on", p >= AT[i % AT.length] - 0.001));
      el.style.setProperty("--sg-route-p", p.toFixed(3));
    };
    const onScroll = () => {
      if (visible && !raf) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) onScroll();
    });
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    draw();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      el.removeAttribute("data-armed");
    };
  }, []);

  return (
    <section ref={ref} className="sg-route" aria-labelledby="sg-route-h">
      <div className="sg-route-dots" aria-hidden="true" />
      <div className="sg-route-inner">
        <div className="sg-head">
          <span className="sg-eyebrow">Where it gets stuck</span>
          <h2 id="sg-route-h">From mess to order.</h2>
          <p>What we found when we sat with Futprep, and how it runs now.</p>
        </div>
        <div className="sg-route-map">
          <svg viewBox="0 0 1000 240" aria-hidden="true" focusable="false">
            <path className="sg-route-mess" d={MESS} />
            <path className="sg-route-order" d={ORDER} />
          </svg>
          {STOPS.map((stop, i) => (
            <span
              key={stop.title}
              className={`sg-route-pin${i === 3 ? " sg-route-pin-end" : ""}`}
              style={{ left: `${12.5 + i * 25}%` }}
              data-stop=""
              data-on=""
              aria-hidden="true"
            >
              {i + 1}
            </span>
          ))}
        </div>
        <ol className="sg-route-stops">
          {STOPS.map((stop, i) => (
            <li key={stop.title} data-stop="" data-on="" className={i === 3 ? "sg-route-stop-end" : undefined}>
              <span className="sg-route-tag">{i === 3 ? "Now" : "Before"}</span>
              <strong>{stop.title}</strong>
              <span>{stop.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
