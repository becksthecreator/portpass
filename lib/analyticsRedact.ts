// What Vercel Web Analytics and Speed Insights are allowed to learn about a
// page view (privacy policy v2, "Cookies and what is kept on your device").
// Both scripts call a `beforeSend` hook with the page address; this is that
// hook's logic.
//
// - Staff, admin, account and business-dashboard pages are not reported at
//   all (null drops the event).
// - A registration reference code or a return-link token in the path is
//   replaced with a placeholder.
// - Every query parameter is dropped except the campaign tags and the PWA
//   marker, so nothing like ?email= or ?name= is ever sent.
//
// IMPORTANT: this function is turned into text and inlined into every page
// by app/layout.tsx, so it must stay self-contained: no imports, no outer
// variables, nothing newer than a browser from 2019 understands.
export function redactAnalyticsUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "https://portpassbahamas.com");
    let path = parsed.pathname;
    if (/^\/(admin|organizations|account|where-to)(\/|$)/.test(path)) return null;
    if (/^\/business\//.test(path)) return null;
    if (/^\/futprep\/staff(\/|$)/.test(path)) return null;
    if (/^\/weddings\/(admin|staff)(\/|$)/.test(path)) return null;
    path = path.replace(/^\/futprep\/my\/[^/]+/, "/futprep/my/[code]");
    path = path.replace(/^\/futprep\/register\/return\/[^/]+/, "/futprep/register/return/[token]");
    const kept: string[] = [];
    const allowed = ["utm_source", "utm_medium", "utm_campaign", "source"];
    for (let i = 0; i < allowed.length; i += 1) {
      const value = parsed.searchParams.get(allowed[i]);
      if (value) kept.push(allowed[i] + "=" + encodeURIComponent(value.slice(0, 80)));
    }
    return parsed.origin + path + (kept.length ? "?" + kept.join("&") : "");
  } catch {
    return null;
  }
}

// The inline script for the root layout: registers the hook with whichever
// of the two Vercel queues exist. An event keeps its other fields; only the
// address changes.
export function analyticsRedactionScript(): string {
  return (
    "(function(){var r=" +
    redactAnalyticsUrl.toString() +
    ";function h(e){if(!e||!e.url)return e;var u=r(e.url);if(u===null)return null;e.url=u;return e}" +
    "if(window.va)window.va('beforeSend',h);if(window.si)window.si('beforeSend',h)})();"
  );
}
