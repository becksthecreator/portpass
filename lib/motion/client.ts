// Whether motion may run for this visitor (brief 22, M1): the kill switch
// on <html> (data-motion, from the motion setting in Admin -> Content) and
// the visitor's own reduced-motion preference. Any script that would start
// an animation asks this first; the stylesheet (lib/motion/motion.css)
// asks the same two things through html[data-motion="off"] and
// prefers-reduced-motion, so the two never disagree.
export function motionEnabled(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.getAttribute("data-motion") === "off") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    // An old browser without matchMedia: the stylesheet still honours the preference.
  }
  return true;
}

// A duration token from lib/motion/tokens.css, in milliseconds, for the
// few effects a script has to time (the Departure Board's flicker). The
// stylesheet is the one place the numbers live; `fallback` is used only if
// the token cannot be read.
export function tokenMs(name: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith("ms")) return value;
  if (raw.endsWith("s")) return value * 1000;
  return value;
}
