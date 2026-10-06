import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { cspReportsFrom } from "@/lib/cspReport";

export const dynamic = "force-dynamic";

// Where a browser sends what the Content-Security-Policy would have
// blocked (lib/securityHeaders.ts, report-only for the first week). Open
// to the internet by necessity: browsers post here with no session. Each
// report becomes one line in the host's log, and only the parts that say
// what the policy needs (lib/cspReport.ts). Nothing is stored; Vercel's
// log search is the reader.
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
    console.warn("csp: the policy would block this", report);
  }
  return new NextResponse(null, { status: 204 });
}
