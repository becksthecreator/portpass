// @public-route: one tap on /demo starts a demo session; no account is involved.
import { NextResponse } from "next/server";
import { ensureDemoBusiness } from "@/db/demo";
import { demoCookie } from "@/lib/auth/demo";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

// A stall's worth of phones on one Wi-Fi address, not a script.
const limited = createRateLimiter(60, 10 * 60_000);

const to = (request: Request, path: string) => NextResponse.redirect(new URL(path, request.url), 303);

// Starts a demo session (brief 18, part B): a cookie that opens the demo
// business and nothing else, for two hours. The demo is made here the
// first time, and written again if the nightly reset has missed it.
export async function POST(request: Request) {
  if (limited(clientIp(request))) return to(request, "/demo?error=busy");
  try {
    const demo = await ensureDemoBusiness();
    const cookie = demoCookie(demo.id);
    if (!cookie) return to(request, "/demo?error=1");
    const response = to(request, "/demo/home");
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    console.error("demo start", error instanceof Error ? error.message : "");
    return to(request, "/demo?error=1");
  }
}

// A typed or shared address: the page with the button.
export function GET(request: Request) {
  return to(request, "/demo");
}
