import { NextResponse } from "next/server";
import {
  FUTPREP_STAFF_COOKIE,
  makeStaffToken,
} from "@/app/futprep/staff-auth";
import { staffSignIn } from "@/lib/staffSignIn";

export async function POST(request: Request) {
  // Wrong PINs are limited per account and per address (lib/staffSignIn.ts).
  const result = await staffSignIn(request, "futprep", makeStaffToken);
  if (!result.ok) return result.response;

  const [, role] = result.token.split(".");
  const response = NextResponse.json({ ok: true, accountKey: result.accountKey, role });
  response.cookies.set(FUTPREP_STAFF_COOKIE, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(FUTPREP_STAFF_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
