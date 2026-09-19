import { NextResponse } from "next/server";
import {
  WEDDING_STAFF_COOKIE,
  changeWeddingPin,
  currentWeddingStaffAccount,
} from "@/app/weddings/staff-auth";

export async function POST(request: Request) {
  const account = await currentWeddingStaffAccount();
  if (!account) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { currentPin?: string; newPin?: string };
  const currentPin = String(body.currentPin ?? "");
  const newPin = String(body.newPin ?? "");

  if (newPin.length < 4 || !/^\d+$/.test(newPin)) {
    return NextResponse.json({ error: "New PIN must be at least 4 digits." }, { status: 400 });
  }

  try {
    const token = await changeWeddingPin(account, currentPin, newPin);
    if (!token) return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(WEDDING_STAFF_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_PIN") return NextResponse.json({ error: "New PIN must be at least 4 digits." }, { status: 400 });
    console.error("Wedding change-pin error", error);
    return NextResponse.json({ error: "Could not update PIN." }, { status: 500 });
  }
}
