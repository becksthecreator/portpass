import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type FutprepStaffRole = "admin" | "coach" | "ceo";

const COOKIE = "portpass_futprep_staff";

function secretFor(role: FutprepStaffRole) {
  const value =
    role === "admin"
      ? process.env.PORTPASS_FUTPREP_ADMIN_PIN
      : role === "coach"
        ? process.env.PORTPASS_FUTPREP_COACH_PIN
        : process.env.PORTPASS_FUTPREP_CEO_PIN;
  return typeof value === "string" ? value.trim() : "";
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function staffAccessConfigured(role: FutprepStaffRole) {
  return Boolean(secretFor(role));
}

export async function makeStaffToken(role: FutprepStaffRole, pin: string) {
  const expected = secretFor(role);
  if (!expected || pin !== expected) return null;
  return `${role}.${await digest(`portpass:futprep:${role}:${expected}`)}`;
}

export async function currentFutprepStaffRole(): Promise<FutprepStaffRole | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const [roleValue, signature] = token.split(".");
  if (roleValue !== "admin" && roleValue !== "coach" && roleValue !== "ceo") return null;

  const role = roleValue as FutprepStaffRole;
  const secret = secretFor(role);
  if (!secret) return null;

  const expected = await digest(`portpass:futprep:${role}:${secret}`);
  return signature === expected ? role : null;
}

export async function requireFutprepStaff(
  allowed: FutprepStaffRole[],
  returnTo: string,
) {
  const role = await currentFutprepStaffRole();
  if (role && allowed.includes(role)) return role;
  redirect(`/futprep/lil-kickers/staff/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export const FUTPREP_STAFF_COOKIE = COOKIE;
