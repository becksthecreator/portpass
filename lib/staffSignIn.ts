import { NextResponse } from "next/server";
import { clearStaffLoginFailures, recordStaffLoginFailure, STAFF_LOGIN_MAX_FAILURES, STAFF_LOGIN_WINDOW_MINUTES, staffLoginLocked, type StaffArea } from "@/db/staffLoginAttempts";
import { afterResponse } from "@/lib/afterResponse";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

// The staff PIN check shared by the Futprep and Wedding Desk sign-in
// routes, with the limits a six-digit PIN needs: five wrong PINs lock that
// account name for 15 minutes (counted in the database, so it holds across
// server instances, and holds however many guesses arrive at once), and one
// address gets 20 tries per 15 minutes on this instance. A locked account
// refuses even the right PIN until the window passes; otherwise the lock
// would not stop a guesser.

const perAddress = createRateLimiter(20, STAFF_LOGIN_WINDOW_MINUTES * 60 * 1000);

const LOCKED_MESSAGE = `Too many wrong attempts. Wait ${STAFF_LOGIN_WINDOW_MINUTES} minutes and try again, or ask an admin to reset your PIN.`;

export type StaffSignIn =
  | { ok: true; accountKey: string; token: string }
  | { ok: false; response: NextResponse };

const locked = (): StaffSignIn => ({
  ok: false,
  response: NextResponse.json({ error: LOCKED_MESSAGE }, { status: 429, headers: { "Retry-After": String(STAFF_LOGIN_WINDOW_MINUTES * 60) } }),
});

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

  // Over the address limit, or already locked: refused before anything
  // more is written.
  if (perAddress(`${area}:${clientIp(request)}`) || (await staffLoginLocked(area, accountKey))) return locked();

  // A PIN is digits, six or more; nothing real is anywhere near this long,
  // so a huge body never reaches the hash (Brief 24, part D).
  const pin = String(body.pin ?? "");
  // Counted before the check, and the count read back after: guesses sent
  // at the same moment all pass the check above, but each one's count
  // includes every guess recorded before it, so at most five in a window
  // reach the (slow) PIN check however many arrive together (audit finding
  // 6). A correct PIN clears the count below, as it always has.
  if ((await recordStaffLoginFailure(area, accountKey)) > STAFF_LOGIN_MAX_FAILURES) return locked();
  const token = pin.length > 64 ? null : await makeToken(accountKey, pin);
  if (!token) {
    // Counted for the failed-sign-ins alert (Brief 21, part G): the address
    // only, once the answer has gone, so it is neither waited for nor cut
    // off. Loaded here, not at the top, so this module stays free of the
    // database for its unit test.
    const ip = clientIp(request);
    afterResponse(() => import("@/db/alerts").then((alerts) => alerts.recordFailedSignIn("pin_failed", ip)));
    return { ok: false, response: NextResponse.json({ error: "That account name or PIN is incorrect." }, { status: 401 }) };
  }

  await clearStaffLoginFailures(area, accountKey);
  return { ok: true, accountKey, token };
}
