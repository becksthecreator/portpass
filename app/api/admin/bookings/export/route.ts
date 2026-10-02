import { NextResponse } from "next/server";
import { exportBookings } from "@/db/adminBookings";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";

const limited = createRateLimiter(20, 10 * 60_000);

// Admin -> Bookings: one business's bookings as a CSV (brief 08, 1.6).
// The file has no medical, allergy, medication, special-needs or emergency
// column: db/adminBookings.ts never selects them for a list. Each export is
// written to the audit log.
export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  // An export is logged in the founder's name, so it must be their own
  // click: a link on another site can't trigger one.
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many exports in a short time. Try again in a few minutes." }, { status: 429 });
  const org = new URL(request.url).searchParams.get("org") ?? "";
  if (!/^\d{1,12}$/.test(org) || Number(org) <= 0) return NextResponse.json({ error: "Choose a business to export." }, { status: 400 });

  try {
    const { csv } = await exportBookings(Number(org), auth.session.userId);
    const day = new Date().toISOString().slice(0, 10);
    // The byte order mark makes Excel read accented names correctly.
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="portpass-bookings-${org}-${day}.csv"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("admin bookings export", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not make the export." }, { status: 500 });
  }
}
