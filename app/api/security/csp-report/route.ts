import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { cspReportsFrom } from "@/lib/cspReport";
import { CSP_MODE } from "@/lib/securityHeaders";

export const dynamic = "force-dynamic";

// Where a browser reports what the Content-Security-Policy blocked
// (lib/securityHeaders.ts; enforced since brief 26, report-only before, when
// it said what it would have blocked). Open to the internet by necessity:
// browsers post here with no session. Each report becomes one line in the
// host's log, and only the parts that say what the policy needs
// (lib/cspReport.ts). Nothing is stored; Vercel's log search for
// "csp: the policy" is the reader.
const limited = createRateLimiter(60, 60_000);
const MAX_BODY = 20_000;

export async function POST(request: Request) {
  if (limited(clientIp(request))) return new NextResponse(null, { status: 429 });
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  for (const report of cspReportsFrom(body).slice(0, 10)) {
    if (!report.directive) continue;
    console.warn(CSP_MODE === "enforce" ? "csp: the policy blocked this" : "csp: the policy would block this", report);
  }
  return new NextResponse(null, { status: 204 });
}
