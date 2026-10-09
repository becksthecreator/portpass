"use client";

import { useState } from "react";

// Copies a link on this site to the clipboard: the path given, on whatever
// origin the page is open on (so a preview copies a preview link). When the
// clipboard is not allowed, the link is shown to copy by hand.
export function CopyLinkButton({ path, label = "Copy link", className = "admin-action" }: { path: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [url, setUrl] = useState("");
  async function copy() {
    const full = `${window.location.origin}${path}`;
    setUrl(full);
    try {
      await navigator.clipboard.writeText(full);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  }
  return (
    <>
      <button type="button" className={className || undefined} onClick={() => void copy()} aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy by hand:" : label}
      </button>
      {state === "failed" && <code style={{ userSelect: "all", wordBreak: "break-all" }}>{url}</code>}
    </>
  );
}
