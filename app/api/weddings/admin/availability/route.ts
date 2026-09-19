import { NextResponse } from "next/server";
import { currentWeddingStaffId, currentWeddingStaffRole } from "@/app/weddings/staff-auth";
import { addUnavailableDate, listUnavailableDatesAdmin, removeUnavailableDate } from "@/db/weddingAvailability";

export async function POST(request: Request) {
  const role = await currentWeddingStaffRole();
  if (role !== "antonio") return NextResponse.json({ error: "Only Antonio can manage availability." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { onDate?: string; note?: string };
  try {
    const staffId = await currentWeddingStaffId();
    await addUnavailableDate(String(body.onDate ?? ""), body.note ?? null, staffId);
    return NextResponse.json({ dates: await listUnavailableDatesAdmin() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_DATE") return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
    if (message === "ALREADY_BLOCKED") return NextResponse.json({ error: "That date is already blocked." }, { status: 409 });
    console.error("Wedding availability add error", error);
    return NextResponse.json({ error: "Could not block that date." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const role = await currentWeddingStaffRole();
  if (role !== "antonio") return NextResponse.json({ error: "Only Antonio can manage availability." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { id?: number };
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  try {
    await removeUnavailableDate(Number(body.id));
    return NextResponse.json({ dates: await listUnavailableDatesAdmin() });
  } catch (error) {
    console.error("Wedding availability remove error", error);
    return NextResponse.json({ error: "Could not remove that date." }, { status: 500 });
  }
}
