"use client";

import Link from "next/link";

export function StaffLogoutButton() {
  async function logout() {
    await fetch("/api/futprep/lil-kickers/staff/session", { method: "DELETE" });
    window.location.href = "/futprep/lil-kickers/staff/login";
  }

  return (
    <span className="staff-nav-actions">
      <Link href="/futprep/lil-kickers/staff/change-pin">Change PIN</Link>
      <button className="staff-logout-button" type="button" onClick={logout}>Sign out</button>
    </span>
  );
}
