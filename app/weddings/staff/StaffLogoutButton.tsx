"use client";

import Link from "next/link";

export function StaffLogoutButton() {
  async function logout() {
    await fetch("/api/weddings/staff/session", { method: "DELETE" });
    window.location.href = "/weddings/staff/login";
  }

  return (
    <span className="staff-nav-actions">
      <Link href="/weddings/bahamas-weddings-by-the-sea">Wedding site</Link>
      <Link href="/weddings/staff/change-pin">Change PIN</Link>
      <button className="staff-logout-button" type="button" onClick={logout}>Sign out</button>
    </span>
  );
}
