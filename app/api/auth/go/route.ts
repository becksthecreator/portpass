import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSignedInApi } from "@/lib/auth/guards";
import { destinationsFor, LAST_CHOICE_COOKIE } from "@/lib/auth/routing";

// The "Where to?" chooser and the account-menu switcher send people
// through here so the choice is remembered for next time. Only a
// destination this person actually has is accepted; anything else lands
// back on the chooser.
export async function GET(request: Request) {
  const auth = await requireSignedInApi();
  if (!auth.ok) return NextResponse.redirect(new URL("/login", request.url));

  const to = new URL(request.url).searchParams.get("to") ?? "";
  const allowed = destinationsFor(auth.session).some((d) => d.href === to);
  if (!allowed) return NextResponse.redirect(new URL("/where-to", request.url));

  (await cookies()).set(LAST_CHOICE_COOKIE, to, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.redirect(new URL(to, request.url));
}
