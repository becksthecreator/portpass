"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cleanEventPath, type PageEvent } from "@/lib/growth";

// Counts views and taps on a business's public pages for its growth report
// (brief 05, part 2). First-party only: it tells our own server which
// public page was opened and what was tapped. No name, no account, nothing
// typed into a form. On any other page it does nothing at all.
export function recordGrowthEvent(event: PageEvent, pathname: string = window.location.pathname) {
  const path = cleanEventPath(pathname);
  if (!path) return;
  try {
    const body = JSON.stringify({ path, event });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // counting must never break the page
  }
}

export function GrowthBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) recordGrowthEvent("view", pathname);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!cleanEventPath(window.location.pathname)) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      // A message to the business (wa.me/<its number>), not the "share this
      // page" link, which has no number in it.
      if (/^https:\/\/wa\.me\/\d/.test(href)) recordGrowthEvent("whatsapp_click");
      else if (href.startsWith("/futprep/register") && !href.startsWith("/futprep/register/return")) recordGrowthEvent("register_click");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
