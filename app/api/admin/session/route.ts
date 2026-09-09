import { NextResponse } from "next/server";
import { PORTPASS_ADMIN_COOKIE, adminAccessConfigured, makeAdminToken } from "@/lib/admin-auth";

export async function POST(request: Request) {
  if (!adminAccessConfigured()) {
    return NextResponse.json(
      { error: "Admin access is not configured. Set PORTPASS_ADMIN_PIN in the environment." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({})) as { pin?: string };
  const token = await makeAdminToken(String(body.pin ?? ""));
  if (!token) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTPASS_ADMIN_COOKIE, token, {
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
  response.cookies.set(PORTPASS_ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
