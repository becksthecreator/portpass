import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { FUTPREP_STAFF_COOKIE } from "@/app/futprep/staff-auth";
import { futprepOrganization, pageEventsOverCap, recordPageEvent } from "@/db/growth";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { channelFromAttribution, cleanEventPath, isPageEvent } from "@/lib/growth";

// @public-route: counts what happens on a business's public pages for its
// growth report (brief 05, part 2): a view, a WhatsApp tap, a Register
// click, a registration form started. First-party only, and only from our
// own pages. What is saved is the page, the event and how the visitor
// arrived. No name, no account, no IP address (it is used here only to
// slow a flood, and never stored), and nothing from a form. A page whose address could identify someone (a
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

// Only our own pages may count: a browser says where a request came from,
// so another website cannot make its visitors' browsers add to the numbers.
function fromOurOwnPage(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return false;
  }
}

// Always answers 204: the page never waits on this, and a refusal tells a
// stranger nothing.
const done = () => new NextResponse(null, { status: 204 });

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["path", "event"]);

export async function POST(request: Request) {
  if (!fromOurOwnPage(request)) return done();
  if (BOT.test(request.headers.get("user-agent") ?? "")) return done();
  if (limited(clientIp(request))) return done();
  // Staff looking at their own public pages are not visitors.
  if (cookie(request, FUTPREP_STAFF_COOKIE)) return done();

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: { path?: unknown; event?: unknown } | null = read.value;
  const path = cleanEventPath(body?.path);
  if (!path || !isPageEvent(body?.event)) return done();

  try {
    const organization = await futprepOrganization();
    if (!organization) return done();
    // A ceiling on one day's counts (db/growth.ts), so a flood stops here.
    if (await pageEventsOverCap(organization.id)) return done();
    const sourceChannel = channelFromAttribution(parseAttributionCookie(cookie(request, ATTRIBUTION_COOKIE)));
    await recordPageEvent({ organizationId: organization.id, path, event: body.event, sourceChannel });
  } catch (error) {
    console.error("page event not recorded", error instanceof Error ? error.message : "");
  }
  return done();
}
