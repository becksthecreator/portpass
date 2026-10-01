"use client";

import { useEffect } from "react";

// The admin tabs scroll sideways on a phone. This brings the current tab
// into view when a page opens, so it is never hidden off the edge.
export function AdminTabsScroll() {
  useEffect(() => {
    document.querySelector<HTMLElement>('.admin-tabs a[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);
  return null;
}
