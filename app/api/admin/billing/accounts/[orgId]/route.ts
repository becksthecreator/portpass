import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { saveAccount } from "@/db/billing";
import { cleanAccount } from "@/lib/billingInput";

type Ctx = { params: Promise<{ orgId: string }> };

const limited = createRateLimiter(60, 10 * 60_000);

// Admin -> Billing: create or change one business's account (brief 09,
// 2.4). Platform role plus the authenticator step; audit-logged with
// before and after in db/billing.ts.
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const orgId = Number((await ctx.params).orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const cleaned = cleanAccount(await request.json().catch(() => null));
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  try {
    const account = await saveAccount(orgId, cleaned.value, auth.session.userId);
    return NextResponse.json({ ok: true, status: account.status, freeUntil: account.freeUntil, nextInvoiceOn: account.nextInvoiceOn });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "That business no longer exists." }, { status: 404 });
    console.error("admin billing account", message);
    return NextResponse.json({ error: "Could not finish saving. Reload to see what is stored." }, { status: 500 });
  }
}
