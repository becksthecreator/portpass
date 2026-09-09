import { NextResponse } from "next/server";
import {
  FUTPREP_STAFF_COOKIE,
  makeStaffToken,
} from "@/app/futprep/lil-kickers/staff-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { accountKey?: string; pin?: string };
  const accountKey = String(body.accountKey ?? "").trim().toLowerCase();
  if (!accountKey) {
    return NextResponse.json({ error: "Enter your account name." }, { status: 400 });
  }

  const token = await makeStaffToken(accountKey, String(body.pin ?? ""));
  if (!token) {
    return NextResponse.json(
      { error: "That account name or PIN is incorrect." },
      { status: 401 }
    );
  }

  const [, role] = token.split(".");
  const response = NextResponse.json({ ok: true, accountKey, role });
  response.cookies.set(FUTPREP_STAFF_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
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
