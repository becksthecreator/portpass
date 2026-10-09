"use client";

import { useState } from "react";

// Copies a link on this site to the clipboard: the path given, on whatever
// origin the page is open on (so a preview copies a preview link).
export function CopyLinkButton({ path, label = "Copy link", className = "admin-action" }: { path: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button type="button" className={className} onClick={() => void copy()} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Press and hold the link to copy" : label}
    </button>
  );
}
