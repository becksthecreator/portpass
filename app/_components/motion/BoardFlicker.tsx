"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motionEnabled, tokenMs } from "@/lib/motion/client";

// The Departure Board's flicker (brief 22, M3). The digits are in the
// server HTML at their true values (DepartureBoard.tsx); when the board
// first comes into view, every cell flips through other digits one
// --dur-flap at a time, settling left to right by the end of --dur-board,
// back on the true value. Once: the observer lets go after the first time.
// Not at all under reduced motion or the kill switch. A cell is a
// fixed-width box of tabular figures, so a swap never moves anything; the
// swap writes the cell's existing text node, never a new one.
const FINAL = "data-final";

function setDigit(cell: HTMLElement, digit: string) {
  const text = cell.firstChild;
  if (text && text.nodeType === Node.TEXT_NODE) text.nodeValue = digit;
  else cell.textContent = digit;
}

function settleAll(cells: HTMLElement[]) {
  for (const cell of cells) {
    setDigit(cell, cell.getAttribute(FINAL) ?? "");
    cell.removeAttribute("data-flap");
  }
}

function flicker(cells: HTMLElement[]): number {
  const total = tokenMs("--dur-board", 900);
  const tick = tokenMs("--dur-flap", 60);
  // Each cell settles a little after the one before it.
  const settleAt = cells.map((_, i) => total * (0.55 + (0.45 * (i + 1)) / cells.length));
  const settled = cells.map(() => false);
  const started = performance.now();
  const timer = window.setInterval(() => {
    const elapsed = performance.now() - started;
    cells.forEach((cell, i) => {
      if (settled[i]) return;
      if (elapsed >= settleAt[i]) {
        settled[i] = true;
        setDigit(cell, cell.getAttribute(FINAL) ?? "");
        cell.removeAttribute("data-flap");
        return;
      }
      const current = cell.textContent ?? "";
      let next = String(Math.floor(Math.random() * 10));
      if (next === current) next = String((Number(next) + 1) % 10);
      setDigit(cell, next);
      // Two names, so each swap restarts the fold.
      cell.setAttribute("data-flap", cell.getAttribute("data-flap") === "a" ? "b" : "a");
    });
    if (settled.every(Boolean)) window.clearInterval(timer);
  }, tick);
  return timer;
}

export function BoardFlicker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !motionEnabled() || typeof IntersectionObserver === "undefined") return;
    const cells = Array.from(root.querySelectorAll<HTMLElement>(`.board-cell[${FINAL}]`));
    if (!cells.length) return;
    let timer: number | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        // isIntersecting is true at any overlap; the board flickers only
        // once most of it is on screen.
        if (!entries.some((entry) => entry.intersectionRatio >= 0.6)) return;
        io.disconnect();
        timer = flicker(cells);
      },
      { threshold: 0.6 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      if (timer !== null) window.clearInterval(timer);
      settleAll(cells);
    };
  }, []);

  return (
    <div ref={ref} className="board-flicker">
      {children}
    </div>
  );
}
