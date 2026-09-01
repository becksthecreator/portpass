import { NextResponse } from "next/server";
import {
  FUTPREP_STAFF_COOKIE,
  makeStaffToken,
  type FutprepStaffAccount,
} from "@/app/futprep/lil-kickers/staff-auth";

const validAccounts: FutprepStaffAccount[] = ["admin", "coach", "ceo", "kione", "adon"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { account?: string; role?: string; pin?: string };
  const accountValue = body.account ?? body.role;
  if (!accountValue || !validAccounts.includes(accountValue as FutprepStaffAccount)) {
    return NextResponse.json({ error: "Choose a valid staff account." }, { status: 400 });
  }

  const account = accountValue as FutprepStaffAccount;
  const token = await makeStaffToken(account, String(body.pin ?? ""));
  if (!token) {
    return NextResponse.json(
      { error: "Staff access is not configured yet or the PIN is incorrect." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true, account });
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
