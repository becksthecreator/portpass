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
  // The couple gave names and email on the planner's second step.
  | "planner_contact"
  // The wedding planner's plan reached the Wedding Desk (the conversion).
  | "planner_submit"
  // Installable app (round 5, §6): the appinstalled event, and an open
  // from the home screen (start_url carries ?source=pwa).
  | "pwa_installed"
  | "pwa_open"
  // A business signed up on the event form (/own, /join/<event>).
  | "event_signup";

// Google Analytics 4, where a page loads it (only Bahamas Weddings By The
// Sea's pages today, app/weddings/bahamas-weddings-by-the-sea/BwsGoogleAnalytics.tsx).
type Gtag = (command: "event", name: string, params?: Record<string, string | number | boolean>) => void;

export function track(name: AnalyticsEvent, data?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { va?: Va; gtag?: Gtag };
  try {
    if (typeof w.va === "function") w.va("event", { name, data });
  } catch {
    // analytics must never break the page
  }
  try {
    if (typeof w.gtag === "function") w.gtag("event", name, data);
  } catch {
    // analytics must never break the page
  }
}
