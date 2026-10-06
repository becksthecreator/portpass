// The HTTP security headers every answer carries (Brief 21, part D), built
// here so next.config.ts stays a list and a unit test can read the policy.
// scripts/security/headers-check.mjs fetches the live site and fails when
// one is missing.

export type CspMode = "report-only" | "enforce";

// Report-only first: for a week the browser reports what the policy WOULD
// have blocked to /api/security/csp-report and blocks nothing. When the
// reports show nothing the site needs, this flips to "enforce" in one
// line. Set to report-only on 6 Oct 2026.
export const CSP_MODE: CspMode = "report-only";
export const CSP_REPORT_PATH = "/api/security/csp-report";

// What the pages really load, and from where:
//  - scripts: our own, plus Vercel's analytics and speed-insights tags
//    (served from this origin under /_vercel/) and the review widget a
//    wedding business pastes in (WeddingWire). 'unsafe-inline' is there
//    because Next.js hydrates every page with inline scripts and the
//    nonce-per-request alternative would turn off static caching for every
//    page; the value of the policy is in the allow-list of origins and in
//    the directives below it, not in blocking inline code yet.
//  - styles: our own, inline (Next.js and the brand colours set per business).
//  - images: our own, data: and blob: for previews and the Member Pass QR,
//    and any https image a business has linked (hero and logo URLs are the
//    business's own).
//  - fonts: self-hosted by next/font; nothing is fetched from Google Fonts
//    at run time.
//  - connections: our own API and Vercel's vitals endpoint. The browser
//    never talks to Supabase directly.
//  - frames: the review widget may open one; nothing else.
//  - frame-ancestors 'none': no page of ours is framed anywhere, /pay and
//    /demo included (also X-Frame-Options: DENY, for older browsers).
const CSP_DIRECTIVES: Array<[string, string[]]> = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'", "https://www.weddingwire.com"]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  ["img-src", ["'self'", "data:", "blob:", "https:"]],
  ["font-src", ["'self'", "data:"]],
  ["connect-src", ["'self'", "https://vitals.vercel-insights.com"]],
  ["frame-src", ["https://www.weddingwire.com", "https://www.google.com"]],
  ["frame-ancestors", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  ["object-src", ["'none'"]],
  ["manifest-src", ["'self'"]],
  ["worker-src", ["'self'"]],
  ["upgrade-insecure-requests", []],
  ["report-uri", [CSP_REPORT_PATH]],
];

export function contentSecurityPolicy(): string {
  return CSP_DIRECTIVES.map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name)).join("; ");
}

export type Header = { key: string; value: string };

// Two years, every subdomain, and on the browsers' preload list.
export const HSTS = "max-age=63072000; includeSubDomains; preload";
// No page uses the camera, the microphone or the visitor's location. The
// photo upload is a file picker (the phone's own camera app), which this
// does not touch.
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

export function securityHeaders(mode: CspMode = CSP_MODE): Header[] {
  return [
    { key: "Strict-Transport-Security", value: HSTS },
    { key: mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ];
}
