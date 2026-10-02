import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { addManualEvent } from "@/db/billing";
import { EVENT_KINDS, isDay } from "@/lib/billing";

const limited = createRateLimiter(40, 10 * 60_000);

// Admin -> Billing -> Fees: add a fee by hand (brief 09, 2.4), for a
// wedding completed before the Desk tracked it, or a supplier booking.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { organizationId?: unknown; kind?: unknown; eventOn?: unknown; bookingValueCents?: unknown; rateBps?: unknown; flatCents?: unknown; note?: unknown } | null;
  const organizationId = Number.isInteger(body?.organizationId) && Number(body?.organizationId) > 0 ? Number(body?.organizationId) : null;
  const kind = EVENT_KINDS.find((k) => k === body?.kind && k !== "grow_with_us_commission");
  const whole = (value: unknown, max: number) => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null);
  const bookingValueCents = whole(body?.bookingValueCents ?? 0, 100_000_000);
  const rateBps = whole(body?.rateBps ?? 0, 10_000);
  const flatCents = whole(body?.flatCents ?? 0, 100_000_000);
  if (!organizationId || !kind) return NextResponse.json({ error: "Choose a business and the kind of fee." }, { status: 400 });
  if (!isDay(body?.eventOn)) return NextResponse.json({ error: "Enter the date of the wedding or booking." }, { status: 400 });
  if (bookingValueCents === null || rateBps === null || flatCents === null) return NextResponse.json({ error: "Amounts are in dollars and can't be negative." }, { status: 400 });
  try {
    const event = await addManualEvent({ organizationId, kind, eventOn: body.eventOn, bookingValueCents, rateBps, flatCents, note: typeof body?.note === "string" ? body.note : "" }, auth.session.userId);
    return NextResponse.json({ ok: true, id: event.id, feeCents: event.feeCents }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOTE_REQUIRED") return NextResponse.json({ error: "Say what the fee is for." }, { status: 400 });
    if (message === "BAD_AMOUNT") return NextResponse.json({ error: "The fee comes to nothing. Enter a flat fee, or a booking value and a rate." }, { status: 400 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "That business no longer exists." }, { status: 404 });
    console.error("admin billing fee", message);
    return NextResponse.json({ error: "Could not add the fee." }, { status: 500 });
  }
}
