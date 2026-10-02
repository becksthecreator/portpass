"use client";

import { useState } from "react";
import { clearStoredPass } from "@/lib/memberPassClient";

export function SignOutButton({ className = "auth-text-button" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    // The Member Pass kept on this phone goes with the session.
    clearStoredPass();
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }
  return (
    <button className={className} type="button" disabled={busy} onClick={() => void signOut()}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
