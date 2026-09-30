"use client";

import { MouseEvent, useEffect, useState } from "react";

type Billing = "monthly" | "annual";

// The Monthly/Annual toggle (speed brief, 29 Sept). The page is cached and
// renders both prices inside .pricing-scope; this marks which one shows
// and keeps ?billing=annual in the URL, so a shared link opens on annual.
// No useSearchParams: that would push the price cards out of the cached
// HTML (they would render only in the browser).
export function BillingToggle() {
  const [billing, setBilling] = useState<Billing>("monthly");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("billing") === "annual") setBilling("annual");
  }, []);

  useEffect(() => {
    document.querySelector(".pricing-scope")?.setAttribute("data-billing", billing);
  }, [billing]);

  function choose(event: MouseEvent<HTMLAnchorElement>, next: Billing) {
    event.preventDefault();
    setBilling(next);
    const url = new URL(window.location.href);
    if (next === "annual") url.searchParams.set("billing", "annual");
    else url.searchParams.delete("billing");
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <nav className="pricing-toggle" aria-label="Billing period">
        <a href="/pricing" aria-current={billing === "monthly" ? "page" : undefined} onClick={(e) => choose(e, "monthly")}>Monthly</a>
        <a href="/pricing?billing=annual" aria-current={billing === "annual" ? "page" : undefined} onClick={(e) => choose(e, "annual")}>Annual</a>
      </nav>
      <span className="pricing-toggle-note" aria-live="polite">{billing === "annual" ? "Annual: 2 months free and setup waived." : "Pay month to month. Cancel before the end of any month."}</span>
    </>
  );
}
