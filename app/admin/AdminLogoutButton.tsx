"use client";

export function AdminLogoutButton() {
  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <button className="staff-logout-button" type="button" onClick={logout}>Sign out</button>
  );
}
