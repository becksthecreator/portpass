// Continuous-drift carousel engine -- shared by every tpl-carousel instance
// (gallery, reviews, and whatever a future business needs one for). Clones
// the track's current children once, drifts left via rAF, and wraps at
// exactly half the track's width so the seam between the real set and its
// clone is invisible -- there is no jump to see, unlike a slide/snap
// carousel.
//
// This is a DOM-level engine, not a React state machine, on purpose: the
// physics (measure, rAF, drag) don't benefit from React's render cycle, and
// letting React own clone nodes it never re-renders would just be
// bookkeeping for no benefit. React's job here is rendering the *real*
// items once; this takes over the DOM node after that, the same way a
// non-React widget library would be wrapped.
export function initCarousel(root: HTMLElement, { speed = 28 }: { speed?: number } = {}): () => void {
  const track = root.querySelector<HTMLElement>(".tpl-carousel-track");
  if (!track || track.dataset.ready) return () => {};

  const originals = Array.from(track.children) as HTMLElement[];
  if (originals.length === 0) return () => {};

  // Clone once for the seamless wrap; clones are decorative and must never
  // be reachable by keyboard, so a Tab press doesn't visit the same
  // content twice.
  originals.forEach((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    // inert covers focus, find-in-page and touch/pointer interaction in one
    // property; kept alongside aria-hidden and the manual tabIndex loop
    // below (not in place of them) for older browsers/AT that predate it.
    clone.inert = true;
    clone.querySelectorAll("a,button,input").forEach((el) => {
      (el as HTMLElement).tabIndex = -1;
    });
    track.appendChild(clone);
  });
  track.dataset.ready = "1";

  let reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // ignore
  }

  let offset = 0;
  let hoverPaused = false;
  let manualPause = reduced;
  let last: number | null = null;
  let half = 0;
  let rafId = 0;

  function isPaused() {
    return hoverPaused || manualPause;
  }

  function measure() {
    half = 0;
    originals.forEach((n) => {
      half += n.getBoundingClientRect().width + 20;
    });
  }
  measure();
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(track);

  function frame(now: number) {
    if (last == null) last = now;
    const dt = (now - last) / 1000;
    last = now;
    if (!isPaused() && half > 0) offset += speed * dt;
    if (offset >= half) offset -= half;
    if (offset < 0) offset += half;
    track!.style.transform = `translate3d(${-offset}px,0,0)`;
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  const pause = () => {
    hoverPaused = true;
  };
  const resume = () => {
    hoverPaused = false;
  };
  root.addEventListener("pointerenter", pause);
  root.addEventListener("pointerleave", resume);
  root.addEventListener("focusin", pause);
  root.addEventListener("focusout", resume);
  root.addEventListener("touchstart", pause, { passive: true });

  // Explicit pause control -- required for accessibility with an
  // auto-moving region: hover/hidden state alone isn't reachable by a
  // keyboard or screen-reader user who never triggers pointerenter/focusin
  // on the carousel itself.
  const pauseBtn = root.querySelector<HTMLButtonElement>(".tpl-carousel-pause");
  const syncPauseBtn = () => {
    if (!pauseBtn) return;
    pauseBtn.textContent = manualPause ? "Play" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(manualPause));
  };
  syncPauseBtn();
  const onPauseClick = () => {
    manualPause = !manualPause;
    syncPauseBtn();
  };
  pauseBtn?.addEventListener("click", onPauseClick);

  // Drag on desktop, swipe on mobile -- both just scrub `offset` directly.
  let dragging = false;
  let startX = 0;
  let startOffset = 0;
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    startX = e.clientX;
    startOffset = offset;
    track!.classList.add("is-dragging");
    track!.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    offset = startOffset - (e.clientX - startX);
  };
  const onPointerRelease = () => {
    dragging = false;
    track!.classList.remove("is-dragging");
  };
  track.addEventListener("pointerdown", onPointerDown);
  track.addEventListener("pointermove", onPointerMove);
  track.addEventListener("pointerup", onPointerRelease);
  track.addEventListener("pointercancel", onPointerRelease);

  // Arrows nudge by one item width rather than jumping to a "page" --
  // there's no page concept in a continuous carousel.
  const step = (dir: number) => {
    offset += dir * (originals[0].getBoundingClientRect().width + 20);
  };
  const prevBtn = root.querySelector<HTMLButtonElement>(".tpl-carousel-prev");
  const nextBtn = root.querySelector<HTMLButtonElement>(".tpl-carousel-next");
  const onPrev = () => step(-1);
  const onNext = () => step(1);
  prevBtn?.addEventListener("click", onPrev);
  nextBtn?.addEventListener("click", onNext);

  let reducedQuery: MediaQueryList | null = null;
  const onReducedChange = (e: MediaQueryListEvent) => {
    manualPause = e.matches;
    syncPauseBtn();
  };
  try {
    reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedQuery.addEventListener("change", onReducedChange);
  } catch {
    // ignore
  }

  return function cleanup() {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    root.removeEventListener("pointerenter", pause);
    root.removeEventListener("pointerleave", resume);
    root.removeEventListener("focusin", pause);
    root.removeEventListener("focusout", resume);
    root.removeEventListener("touchstart", pause);
    pauseBtn?.removeEventListener("click", onPauseClick);
    track!.removeEventListener("pointerdown", onPointerDown);
    track!.removeEventListener("pointermove", onPointerMove);
    track!.removeEventListener("pointerup", onPointerRelease);
    track!.removeEventListener("pointercancel", onPointerRelease);
    prevBtn?.removeEventListener("click", onPrev);
    nextBtn?.removeEventListener("click", onNext);
    reducedQuery?.removeEventListener("change", onReducedChange);
  };
}
