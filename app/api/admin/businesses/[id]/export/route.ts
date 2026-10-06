import { NextResponse } from "next/server";
import { exportBusinessData } from "@/db/businessExport";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

// A few a day is the real rate; this stops a stuck button.
const limited = createRateLimiter(10, 60 * 60_000);

// Admin -> Businesses -> "Export data" (Brief 21, part H 2): everything
// PortPass holds for one business as a JSON file behind a signed link that
// works for 24 hours. Children's health details are never in it
// (db/businessExport.ts). The founder sends the link to the business
// themselves; nothing is emailed from here. Logged as business.exported.
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many exports in a short time. Try again in an hour." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await exportBusinessData(id, auth.session.userId);
    return NextResponse.json({ url: result.url, expiresAt: result.expiresAt, bytes: result.bytes, tables: result.tables }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("admin export", message.slice(0, 200));
    return NextResponse.json({ error: "Could not make the export. Try again." }, { status: 500 });
  }
}
