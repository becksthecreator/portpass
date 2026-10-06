"use client";

import { useState } from "react";
import { clearStoredPass } from "@/lib/memberPassClient";

// One press ends every session on every device (Brief 21, part C). The
// Member Pass kept on this phone goes with it, like a plain sign-out.
export function SignOutEverywhere() {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  async function signOutEverywhere() {
    setState("busy");
    try {
      const response = await fetch("/api/account/sessions", { method: "DELETE" });
      if (!response.ok) {
        setState("failed");
        return;
      }
      clearStoredPass();
      window.location.assign("/login?signed_out=everywhere");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="account-signout-everywhere">
      <button className="secondary-button" type="button" disabled={state === "busy"} onClick={() => void signOutEverywhere()}>
        {state === "busy" ? "Signing out everywhere…" : "Sign out everywhere"}
      </button>
      {state === "failed" && <p className="form-error" role="alert">That didn&rsquo;t work. Check your connection and try again.</p>}
    </div>
  );
}
