import { NextResponse } from "next/server";
import {
  FUTPREP_STAFF_COOKIE,
  createBootstrapAdmin,
  makeStaffToken,
} from "@/app/futprep/lil-kickers/staff-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; accountKey?: string; pin?: string };
  const name = String(body.name ?? "").trim();
  const accountKey = String(body.accountKey ?? "").trim().toLowerCase();
  const pin = String(body.pin ?? "");

  try {
    await createBootstrapAdmin({ name, accountKey, pin });
    const token = await makeStaffToken(accountKey, pin);
    if (!token) throw new Error("Could not sign in the new admin account.");

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
    if (message === "ALREADY_BOOTSTRAPPED") return NextResponse.json({ error: "An admin account already exists. Sign in instead." }, { status: 409 });
    if (message === "NAME_REQUIRED") return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (message === "INVALID_ACCOUNT_KEY") return NextResponse.json({ error: "Account name must be 3-40 characters: lowercase letters, numbers, - or _." }, { status: 400 });
    if (message === "INVALID_PIN") return NextResponse.json({ error: "PIN must be at least 4 digits." }, { status: 400 });
    if (message === "ACCOUNT_KEY_TAKEN") return NextResponse.json({ error: "That account name is taken." }, { status: 409 });
    console.error("Futprep bootstrap-admin error", error);
    return NextResponse.json({ error: "Could not create the admin account." }, { status: 500 });
  }
}
