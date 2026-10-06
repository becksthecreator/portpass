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
