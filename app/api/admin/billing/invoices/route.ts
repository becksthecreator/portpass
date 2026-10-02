import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { createManualInvoice } from "@/db/billing";
import { isDay } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";

const limited = createRateLimiter(40, 10 * 60_000);

// Admin -> Billing: a founder's own invoice (any lines), or something
// billed before this system, kept with its own number (brief 09, part 3:
// the build fee comes in as BWS-BUILD, never as a PP- number).
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many invoices in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { organizationId?: unknown; issuedOn?: unknown; periodStart?: unknown; periodEnd?: unknown; lines?: unknown; historicalNumber?: unknown } | null;
  const organizationId = Number.isInteger(body?.organizationId) && Number(body?.organizationId) > 0 ? Number(body?.organizationId) : null;
  if (!organizationId) return NextResponse.json({ error: "Choose a business." }, { status: 400 });
  // Only something billed before this system carries its own date. A new
  // draft is dated today, and again on the day it is sent.
  const historical = typeof body?.historicalNumber === "string" && body.historicalNumber.trim() !== "";
  if (historical && !isDay(body?.issuedOn)) return NextResponse.json({ error: "Enter the date the old invoice had." }, { status: 400 });
  const issuedOn = historical && isDay(body?.issuedOn) ? body.issuedOn : nassauToday();
  const periodStart = isDay(body?.periodStart) ? body.periodStart : issuedOn;
  const periodEnd = isDay(body?.periodEnd) ? body.periodEnd : periodStart;
  if (periodEnd < periodStart) return NextResponse.json({ error: "The period ends before it starts." }, { status: 400 });
  const lines = (Array.isArray(body?.lines) ? body.lines : []).slice(0, 20).map((line) => {
    const raw = (line ?? {}) as { description?: unknown; amountCents?: unknown };
    return { description: typeof raw.description === "string" ? raw.description : "", amountCents: typeof raw.amountCents === "number" ? raw.amountCents : Number.NaN };
  });
  if (!lines.length || lines.some((line) => !line.description.trim() || !Number.isInteger(line.amountCents) || Math.abs(line.amountCents) > 100_000_000)) return NextResponse.json({ error: "Each line needs a description and an amount." }, { status: 400 });
  try {
    const invoice = await createManualInvoice({ organizationId, issuedOn, periodStart, periodEnd, lines, historicalNumber: historical && typeof body?.historicalNumber === "string" ? body.historicalNumber : null }, auth.session.userId);
    return NextResponse.json({ ok: true, id: invoice.id, number: invoice.number }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BAD_NUMBER") return NextResponse.json({ error: "A number for an old invoice is letters, digits and dashes, and can't start with PP-." }, { status: 400 });
    if (message === "NUMBER_TAKEN") return NextResponse.json({ error: "That number is already used." }, { status: 409 });
    if (message === "LINES_REQUIRED") return NextResponse.json({ error: "Each line needs a description and an amount." }, { status: 400 });
    console.error("admin billing new invoice", message);
    return NextResponse.json({ error: "Could not raise the invoice." }, { status: 500 });
  }
}
