import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import {
  createFutprepProgram,
  listFutprepPrograms,
  setFutprepProgramActive,
  type FutprepProgramInput,
} from "@/db/programs";

export async function GET() {
  const [account, role] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole()]);
  if (!account || role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  try {
    return NextResponse.json({ programs: await listFutprepPrograms() });
  } catch (error) {
    console.error("Futprep programs list error", error);
    return NextResponse.json({ error: "Could not load programs." }, { status: 500 });
  }
}

function str(body: Record<string, unknown>, field: string) {
  return typeof body[field] === "string" ? body[field].trim() : "";
}

function num(body: Record<string, unknown>, field: string) {
  const value = Number(body[field]);
  return Number.isFinite(value) ? value : NaN;
}

export async function POST(request: Request) {
  const [account, role] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole()]);
  if (!account || role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = str(body, "name");
  const locationName = str(body, "locationName");
  const dayOfWeek = str(body, "dayOfWeek");
  const startTime = str(body, "startTime");
  const endTime = str(body, "endTime");
  const termName = str(body, "termName") || "Term";
  const termStartDate = str(body, "termStartDate");
  const termEndDate = str(body, "termEndDate");
  const breakDates = Array.isArray(body.breakDates)
    ? (body.breakDates as unknown[]).map((v) => String(v).trim()).filter(Boolean)
    : [];

  const ageMin = num(body, "ageMin");
  const ageMax = num(body, "ageMax");
  const capacity = num(body, "capacity");
  const weeklyFeeCents = num(body, "weeklyFeeCents");
  const termFeeCents = num(body, "termFeeCents");
  const registrationFeeCents = Number.isFinite(Number(body.registrationFeeCents))
    ? Number(body.registrationFeeCents)
    : 0;

  if (!name || !locationName || !dayOfWeek || !startTime || !termStartDate || !termEndDate) {
    return NextResponse.json({ error: "Complete all required program fields." }, { status: 400 });
  }
  if (![ageMin, ageMax, capacity, weeklyFeeCents, termFeeCents].every(Number.isFinite)) {
    return NextResponse.json({ error: "Ages, capacity, and fees must be numbers." }, { status: 400 });
  }

  const input: FutprepProgramInput = {
    name,
    ageMin,
    ageMax,
    coed: body.coed !== false,
    locationName,
    locationAddress: str(body, "locationAddress"),
    dayOfWeek,
    startTime,
    endTime,
    capacity,
    termName,
    termStartDate,
    termEndDate,
    breakDates,
    weeklyFeeCents,
    termFeeCents,
    registrationFeeCents,
  };

  try {
    const created = await createFutprepProgram(input);
    return NextResponse.json({ ok: true, program: created, programs: await listFutprepPrograms() }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_AGE_RANGE") return NextResponse.json({ error: "Enter a valid age range." }, { status: 400 });
    if (message === "INVALID_CAPACITY") return NextResponse.json({ error: "Capacity must be greater than zero." }, { status: 400 });
    if (message === "INVALID_DAY") return NextResponse.json({ error: "Choose a valid day of the week." }, { status: 400 });
    if (message === "INVALID_TERM_DATES") return NextResponse.json({ error: "The term end date must be on or after the start date." }, { status: 400 });
    if (message === "FUTPREP_ORG_NOT_FOUND") return NextResponse.json({ error: "Could not locate the Futprep organization." }, { status: 500 });
    console.error("Futprep program create error", error);
    return NextResponse.json({ error: "Could not create the program." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const [account, role] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole()]);
  if (!account || role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { id?: number; active?: boolean };
  const id = Number(body.id);
  if (!Number.isInteger(id) || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await setFutprepProgramActive(id, body.active);
    return NextResponse.json({ ok: true, programs: await listFutprepPrograms() });
  } catch (error) {
    console.error("Futprep program active toggle error", error);
    return NextResponse.json({ error: "Could not update the program." }, { status: 500 });
  }
}
