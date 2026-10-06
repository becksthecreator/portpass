import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { customerSaysPaid, isPublicToken } from "@/db/paymentRequests";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ token: string }> };

// A handful of taps per person per ten minutes is plenty.
const limited = createRateLimiter(6, 10 * 60_000);

// The customer's "I've paid" (brief 17, §3): a flag on the business's
// dashboard with an optional note. It never marks the request paid; only
// the business does that, once it has checked.
// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["note"]);

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isPublicToken(token)) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (limited(`${clientIp(request)}|${token}`)) return NextResponse.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: Record<string, unknown> = read.value;
  const note = typeof body.note === "string" ? body.note : "";
  try {
    const result = await customerSaysPaid(token, note);
    if (result === "not_found") return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
    if (result === "closed") return NextResponse.json({ error: "There's nothing left to pay on this request." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("customer says paid", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
