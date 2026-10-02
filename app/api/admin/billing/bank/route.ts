import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { saveBankDetails } from "@/db/billing";
import { bankDetailsComplete } from "@/lib/billing";

const limited = createRateLimiter(20, 10 * 60_000);

// Admin -> Settings: PortPass's own bank details, printed on every invoice
// under "How to pay". Until all four are filled in, no invoice can be sent.
export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  try {
    const bank = await saveBankDetails(await request.json().catch(() => null), auth.session.userId);
    return NextResponse.json({ ok: true, complete: bankDetailsComplete(bank) });
  } catch (error) {
    console.error("admin billing bank details", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not finish saving. Reload to see what is stored." }, { status: 500 });
  }
}
