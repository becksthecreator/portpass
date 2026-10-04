// @public-route: leaving the demo only removes the demo session cookie.
import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demoSession";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/demo", request.url), 303);
  response.cookies.set(DEMO_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/demo", request.url), 303);
}
