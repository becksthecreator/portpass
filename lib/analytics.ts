// Custom events for Vercel Web Analytics (round 4, item 8). The script is
// Vercel's own (/_vercel/insights/script.js, added in app/layout.tsx once
// Web Analytics is enabled for the project); it exposes window.va, which
// queues events until it loads. When the script isn't there this is a
// no-op, so the call sites can ship first. Never pass personal data:
// sections, organisation slugs and offering slugs only.
type Va = (event: "event", payload: { name: string; data?: Record<string, string | number | boolean> }) => void;

export type AnalyticsEvent =
  | "apply_submitted"
  | "whatsapp_click"
  | "share_click"
  | "register_start"
  | "planner_start"
  // Installable app (round 5, §6): the appinstalled event, and an open
  // from the home screen (start_url carries ?source=pwa).
  | "pwa_installed"
  | "pwa_open"
  // A business signed up on the event form (/own, /join/<event>).
  | "event_signup";

export function track(name: AnalyticsEvent, data?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const va = (window as unknown as { va?: Va }).va;
  if (typeof va !== "function") return;
  try {
    va("event", { name, data });
  } catch {
    // analytics must never break the page
  }
}
