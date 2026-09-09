// Edge-safe core only: no next/headers or next/navigation imports here, so
// this file can be pulled into middleware.ts's Edge runtime bundle without
// dragging in Node/Server-Component-only APIs. Page and route-handler-facing
// wrappers (currentPortpassAdmin, requirePortpassAdmin) live in
// lib/admin-session.ts instead.
//
// Stopgap super-admin gate for /admin and /organizations/*, per BUILD_PLAN
// stage 0. This is deliberately a single shared PIN (not per-user) because
// stage 5 replaces it with real accounts + membership; the goal here is only
// to close the open-to-the-internet exposure quickly.
export const PORTPASS_ADMIN_COOKIE = "portpass_admin";

function adminSecret() {
  const value = process.env.PORTPASS_ADMIN_PIN;
  return typeof value === "string" ? value.trim() : "";
}

export function adminAccessConfigured() {
  return Boolean(adminSecret());
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Shared by middleware (Edge runtime, reads the raw cookie value) and route
// handlers/pages, so there is exactly one place that decides what a valid
// admin token looks like.
export async function verifyAdminToken(token: string | undefined | null) {
  if (!token) return false;
  const secret = adminSecret();
  if (!secret) return false;
  const expected = await digest(`portpass:admin:${secret}`);
  return token === expected;
}

export async function makeAdminToken(pin: string) {
  const secret = adminSecret();
  if (!secret || pin !== secret) return null;
  return digest(`portpass:admin:${secret}`);
}
