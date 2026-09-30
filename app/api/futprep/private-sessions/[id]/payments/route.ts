import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { listPrivateSessionRequests, recordPrivateSessionPayment } from "@/db/coaches";

// Staff record money received for a private session against its PS- code
// (brief 06 v2, Part B).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [account, role] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole()]);
  if (!account || !role || role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const requestId = Number((await params).id);
  if (!Number.isInteger(requestId) || requestId < 1) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const amountCents = Math.round(Number(body.amountDollars) * 100);
  const method = body.method === "bank_transfer" || body.method === "online_banking" ? body.method : body.method === "cash" ? "cash" : null;
  if (!Number.isFinite(amountCents) || amountCents <= 0 || !method) return NextResponse.json({ error: "Enter the amount and how it was paid." }, { status: 400 });

  try {
    const result = await recordPrivateSessionPayment({ requestId, amountCents, method, reference: String(body.reference ?? "").slice(0, 80), recordedBy: account });
    const { requests } = await listPrivateSessionRequests();
    return NextResponse.json({ ok: true, ...result, requests }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "REQUEST_NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("private session payment error", error);
    return NextResponse.json({ error: "Could not record the payment." }, { status: 500 });
  }
}
