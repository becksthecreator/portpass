"use client";

export function StaffLogoutButton() {
  async function logout() {
    await fetch("/api/futprep/lil-kickers/staff/session", { method: "DELETE" });
    window.location.href = "/futprep/lil-kickers/staff/login";
  }

  return <button className="staff-logout-button" type="button" onClick={logout}>Sign out</button>;
}
