import { NextResponse } from "next/server";
import {
  FUTPREP_STAFF_COOKIE,
  PIN_PATTERN,
  changeFutprepPin,
  currentFutprepStaffAccount,
} from "@/app/futprep/staff-auth";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

// Five attempts per account per quarter hour: enough for a mistyped
// current PIN, not enough to guess one from a signed-in shared device.
const limited = createRateLimiter(5, 15 * 60_000);

export async function POST(request: Request) {
  const account = await currentFutprepStaffAccount();
  if (!account) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (limited(`${account}:${clientIp(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { currentPin?: string; newPin?: string };
  const currentPin = String(body.currentPin ?? "");
  const newPin = String(body.newPin ?? "");

  if (!PIN_PATTERN.test(newPin)) {
    return NextResponse.json({ error: "New PIN must be at least 6 digits." }, { status: 400 });
  }

  try {
    const token = await changeFutprepPin(account, currentPin, newPin);
    if (!token) return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(FUTPREP_STAFF_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PIN") return NextResponse.json({ error: "New PIN must be at least 6 digits." }, { status: 400 });
    if (message === "SAME_PIN") return NextResponse.json({ error: "Choose a PIN that's different from your current one." }, { status: 400 });
    console.error("Futprep change-pin error", error);
    return NextResponse.json({ error: "Could not update PIN." }, { status: 500 });
  }
}
