"use client";

import Link from "next/link";
import { FUTPREP_SITE } from "@/lib/futprepOffSite";

export function StaffLogoutButton() {
  async function logout() {
    await fetch("/api/futprep/staff/session", { method: "DELETE" });
    window.location.href = "/futprep/staff/login";
  }

  return (
    <span className="staff-nav-actions">
      <a href={FUTPREP_SITE}>Futprep home</a>
      <Link href="/futprep/staff/change-pin">Change PIN</Link>
      <button className="staff-logout-button" type="button" onClick={logout}>Sign out</button>
    </span>
  );
}
