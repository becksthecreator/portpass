import { NextRequest, NextResponse } from "next/server";
import { PORTPASS_ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";

// Structural backstop for the super-admin surface: /admin/* (application
// review) and /organizations/* (every org's enrolment, payments and staff)
// must never be reachable by a new route someone adds later without
// remembering to guard it individually. The page/route handlers still carry
// their own requirePortpassAdmin()/currentPortpassAdmin() checks too — this
// is defense in depth, not a replacement for them.
export const config = {
  matcher: ["/admin/:path*", "/organizations/:path*", "/api/applications/:path+"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  const token = request.cookies.get(PORTPASS_ADMIN_COOKIE)?.value;
  if (await verifyAdminToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}
