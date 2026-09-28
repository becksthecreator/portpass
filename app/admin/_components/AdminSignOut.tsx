"use client";

export function AdminSignOut() {
  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }
  return (
    <button className="admin-bar-link admin-bar-button" type="button" onClick={() => void signOut()}>Sign out</button>
  );
}
