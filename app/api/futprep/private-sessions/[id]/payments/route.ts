import { NextResponse } from "next/server";
import { currentInboxViewer, inboxRequests } from "@/app/futprep/staff/private-sessions/viewer";
import { privateSessionOwners, recordPrivateSessionPayment } from "@/db/coaches";
import { bodyOf, readJson } from "@/lib/api/body";
import { canSeeRequest } from "@/lib/privateSessionAccess";

const Body = bodyOf(["amountDollars", "method", "reference"]);

// Staff record money received for a private session against its reference
// (brief 06 v2, Part B). Brief 31 (C1): a coach only on their own requests;
// another coach's answers 404. The money goes straight to Futprep; this is
// the record of it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { account, viewer } = await currentInboxViewer();
  if (!account || !viewer.role || viewer.role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const requestId = Number((await params).id);
  if (!Number.isInteger(requestId) || requestId < 1) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body = read.value;
  const amountCents = Math.round(Number(body.amountDollars) * 100);
  const method = body.method === "bank_transfer" || body.method === "online_banking" ? body.method : body.method === "cash" ? "cash" : null;
  if (!Number.isFinite(amountCents) || amountCents <= 0 || !method) return NextResponse.json({ error: "Enter the amount and how it was paid." }, { status: 400 });

  const owners = await privateSessionOwners(requestId);
  if (!owners || !canSeeRequest(viewer, owners)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await recordPrivateSessionPayment({ requestId, amountCents, method, reference: String(body.reference ?? "").slice(0, 80), recordedBy: account });
    const { requests } = await inboxRequests(viewer);
    return NextResponse.json({ ok: true, ...result, requests }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "REQUEST_NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("private session payment error", error);
    return NextResponse.json({ error: "Could not record the payment." }, { status: 500 });
  }
}
