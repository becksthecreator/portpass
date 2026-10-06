import { NextResponse } from "next/server";
import { clearStaffLoginFailures, recordStaffLoginFailure, STAFF_LOGIN_WINDOW_MINUTES, staffLoginLocked, type StaffArea } from "@/db/staffLoginAttempts";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

// The staff PIN check shared by the Futprep and Wedding Desk sign-in
// routes, with the limits a six-digit PIN needs: five wrong PINs lock that
// account name for 15 minutes (counted in the database, so it holds across
// server instances), and one address gets 20 tries per 15 minutes on this
// instance. A locked account refuses even the right PIN until the window
// passes; otherwise the lock would not stop a guesser.

const perAddress = createRateLimiter(20, STAFF_LOGIN_WINDOW_MINUTES * 60 * 1000);

const LOCKED_MESSAGE = `Too many wrong attempts. Wait ${STAFF_LOGIN_WINDOW_MINUTES} minutes and try again, or ask an admin to reset your PIN.`;

export type StaffSignIn =
  | { ok: true; accountKey: string; token: string }
  | { ok: false; response: NextResponse };

export async function staffSignIn(
  request: Request,
  area: StaffArea,
  makeToken: (accountKey: string, pin: string) => Promise<string | null>,
): Promise<StaffSignIn> {
  const raw: unknown = await request.json().catch(() => null);
  const body = raw && typeof raw === "object" ? (raw as { accountKey?: unknown; pin?: unknown }) : {};
  const accountKey = String(body.accountKey ?? "").trim().toLowerCase();
  if (!accountKey) {
    return { ok: false, response: NextResponse.json({ error: "Enter your account name." }, { status: 400 }) };
  }

  if (perAddress(`${area}:${clientIp(request)}`) || (await staffLoginLocked(area, accountKey))) {
    return { ok: false, response: NextResponse.json({ error: LOCKED_MESSAGE }, { status: 429, headers: { "Retry-After": String(STAFF_LOGIN_WINDOW_MINUTES * 60) } }) };
  }

  const token = await makeToken(accountKey, String(body.pin ?? ""));
  if (!token) {
    await recordStaffLoginFailure(area, accountKey);
    // Counted for the failed-sign-ins alert (Brief 21, part G): the address
    // only. Loaded here, not at the top, so this module stays free of the
    // database for its unit test.
    void import("@/db/alerts").then((alerts) => alerts.recordFailedSignIn("pin_failed", clientIp(request))).catch(() => {});
    return { ok: false, response: NextResponse.json({ error: "That account name or PIN is incorrect." }, { status: 401 }) };
  }

  await clearStaffLoginFailures(area, accountKey);
  return { ok: true, accountKey, token };
}
