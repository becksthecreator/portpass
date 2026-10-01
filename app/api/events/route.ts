import { NextResponse } from "next/server";
import { FUTPREP_STAFF_COOKIE } from "@/app/futprep/staff-auth";
import { futprepOrganization, recordPageEvent } from "@/db/growth";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { channelFromAttribution, cleanEventPath, isPageEvent } from "@/lib/growth";

// @public-route: counts what happens on a business's public pages for its
// growth report (brief 05, part 2): a view, a WhatsApp tap, a Register
// click, a registration form opened. First-party only. What is saved is
// the page, the event and how the visitor arrived. No name, no account, no
// IP address (it is used here only to slow a flood, and never stored), and
// nothing from a form. A page whose address could identify someone (a
// status page, a staff page, a return link's token) is refused or cleaned
// by cleanEventPath before anything is written.
const limited = createRateLimiter(120, 60_000);

const BOT = /bot|crawl|spider|slurp|preview|monitor|lighthouse|headless|pingdom|uptime/i;

function cookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Always answers 204: the page never waits on this, and a refusal tells a
// stranger nothing.
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  if (BOT.test(request.headers.get("user-agent") ?? "")) return done();
  if (limited(clientIp(request))) return done();
  // Staff looking at their own public pages are not visitors.
  if (cookie(request, FUTPREP_STAFF_COOKIE)) return done();

  const body = (await request.json().catch(() => null)) as { path?: unknown; event?: unknown } | null;
  const path = cleanEventPath(body?.path);
  if (!path || !isPageEvent(body?.event)) return done();

  try {
    const organization = await futprepOrganization();
    if (!organization) return done();
    const sourceChannel = channelFromAttribution(parseAttributionCookie(cookie(request, ATTRIBUTION_COOKIE)));
    await recordPageEvent({ organizationId: organization.id, path, event: body.event, sourceChannel });
  } catch (error) {
    console.error("page event not recorded", error instanceof Error ? error.message : "");
  }
  return done();
}
