import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type FutprepStaffRole = "admin" | "coach" | "ceo";
export type FutprepStaffAccount = "admin" | "coach" | "ceo" | "kione" | "adon";

const COOKIE = "portpass_futprep_staff";

const ACCOUNT_ROLE: Record<FutprepStaffAccount, FutprepStaffRole> = {
  admin: "admin",
  coach: "coach",
  ceo: "ceo",
  kione: "coach",
  adon: "admin",
};

function secretForRole(role: FutprepStaffRole) {
  const value =
    role === "admin"
      ? process.env.PORTPASS_FUTPREP_ADMIN_PIN
      : role === "coach"
        ? process.env.PORTPASS_FUTPREP_COACH_PIN
        : process.env.PORTPASS_FUTPREP_CEO_PIN;
  return typeof value === "string" ? value.trim() : "";
}

function secretForAccount(account: FutprepStaffAccount) {
  const dedicated =
    account === "kione"
      ? process.env.PORTPASS_FUTPREP_KIONE_PIN
      : account === "adon"
        ? process.env.PORTPASS_FUTPREP_ADON_PIN
        : undefined;

  const dedicatedValue = typeof dedicated === "string" ? dedicated.trim() : "";
  return dedicatedValue || secretForRole(ACCOUNT_ROLE[account]);
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function staffAccessConfigured(account: FutprepStaffAccount) {
  return Boolean(secretForAccount(account));
}

export async function makeStaffToken(account: FutprepStaffAccount, pin: string) {
  const expected = secretForAccount(account);
  if (!expected || pin !== expected) return null;
  const role = ACCOUNT_ROLE[account];
  const signature = await digest(`portpass:futprep:${account}:${role}:${expected}`);
  return `${account}.${role}.${signature}`;
}

export async function currentFutprepStaffRole(): Promise<FutprepStaffRole | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const parts = token.split(".");

  // Backward compatibility for staff sessions created before named accounts.
  if (parts.length === 2) {
    const [roleValue, signature] = parts;
    if (roleValue !== "admin" && roleValue !== "coach" && roleValue !== "ceo") return null;
    const role = roleValue as FutprepStaffRole;
    const secret = secretForRole(role);
    if (!secret) return null;
    const expected = await digest(`portpass:futprep:${role}:${secret}`);
    return signature === expected ? role : null;
  }

  if (parts.length !== 3) return null;
  const [accountValue, roleValue, signature] = parts;
  if (
    accountValue !== "admin" &&
    accountValue !== "coach" &&
    accountValue !== "ceo" &&
    accountValue !== "kione" &&
    accountValue !== "adon"
  ) return null;
  if (roleValue !== "admin" && roleValue !== "coach" && roleValue !== "ceo") return null;

  const account = accountValue as FutprepStaffAccount;
  const role = roleValue as FutprepStaffRole;
  if (ACCOUNT_ROLE[account] !== role) return null;

  const secret = secretForAccount(account);
  if (!secret) return null;

  const expected = await digest(`portpass:futprep:${account}:${role}:${secret}`);
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
