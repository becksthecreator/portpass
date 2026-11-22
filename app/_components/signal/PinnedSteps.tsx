"use client";

import { useEffect, useRef } from "react";
import { motionEnabled } from "@/lib/motion/client";

// How it works, pinned (Signal, 22 Nov 2026, motion 06). The section holds
// still while the three steps change, and a rail fills as you scroll. The
// HTML is a plain list of all three steps with the rail full: that is what
// a visitor sees without script, under reduced motion and with the kill
// switch. Only data-pinned, set here when motion may run, turns it into the
// pinned scene (app/_components/signal/signal.css).
const STEPS = [
  {
    word: "We look.",
    text: "We find where your time, money and customers leak, and why earlier fixes didn’t stick. You get a short written plan. The first look is free.",
  },
  {
    word: "We fix.",
    text: "We set PortPass up for your business, with your website and marketing where you need them, and show your staff how to use it.",
  },
  {
    word: "We run it with you.",
    text: "We keep it running and send you an update every week.",
  },
];

export function PinnedSteps() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionEnabled()) return;
    const steps = el.querySelectorAll<HTMLElement>(".sg-step");
    const bars = el.querySelectorAll<HTMLElement>(".sg-rail i");
    el.setAttribute("data-pinned", "");

    let raf = 0;
    let visible = false;
    const draw = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      const p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 1;
      const active = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
      steps.forEach((s, i) => {
        s.toggleAttribute("data-active", i === active);
        s.toggleAttribute("data-past", i < active);
      });
      bars.forEach((b, i) => b.style.setProperty("--sg-fill", Math.min(1, Math.max(0, p * bars.length - i)).toFixed(3)));
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
      el.removeAttribute("data-pinned");
      steps.forEach((s) => {
        s.removeAttribute("data-active");
        s.removeAttribute("data-past");
      });
    };
  }, []);

  return (
    <section ref={ref} className="sg-steps" id="how-we-work" aria-labelledby="sg-steps-h">
      <div className="sg-steps-pin">
        <div className="sg-head">
          <span className="sg-eyebrow">How it works</span>
          <h2 id="sg-steps-h">Three steps, one team.</h2>
        </div>
        <div className="sg-rail" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <ol className="sg-steps-list">
          {STEPS.map((step, i) => (
            <li className="sg-step" key={step.word}>
              <span className="sg-step-n">Step {i + 1}</span>
              <strong>{step.word}</strong>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
