"use client";

import { clearStoredPass } from "@/lib/memberPassClient";

export function AdminSignOut() {
  async function signOut() {
    clearStoredPass();
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }
  return (
    <button className="admin-bar-link admin-bar-button" type="button" onClick={() => void signOut()}>Sign out</button>
  );
}
