import { NextResponse } from "next/server";
import {
  FUTPREP_STAFF_COOKIE,
  makeStaffToken,
  type FutprepStaffRole,
} from "@/app/futprep/lil-kickers/staff-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { role?: string; pin?: string };
  if (body.role !== "admin" && body.role !== "coach" && body.role !== "ceo") {
    return NextResponse.json({ error: "Choose a valid staff account." }, { status: 400 });
  }
  const role = body.role as FutprepStaffRole;
  const token = await makeStaffToken(role, String(body.pin ?? ""));
  if (!token) {
    return NextResponse.json(
      { error: "Staff access is not configured yet or the PIN is incorrect." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true, role });
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
