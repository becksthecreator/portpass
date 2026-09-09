import { NextResponse } from "next/server";
import {
  currentFutprepStaffRole,
  canManageFutprepTeam,
  createStaffAccount,
  listStaffAccounts,
  setStaffAccountActive,
  FUTPREP_STAFF_ROLES,
} from "@/app/futprep/lil-kickers/staff-auth";

async function requireManager() {
  const role = await currentFutprepStaffRole();
  if (!role || !canManageFutprepTeam(role)) return null;
  return role;
}

export async function GET() {
  if (!(await requireManager())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  try {
    return NextResponse.json({ accounts: await listStaffAccounts() });
  } catch (error) {
    console.error("Futprep list accounts error", error);
    return NextResponse.json({ error: "Could not load staff accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await requireManager())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: string; accountKey?: string; role?: string; pin?: string };
  if (!body.role || !(FUTPREP_STAFF_ROLES as string[]).includes(body.role)) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  }

  try {
    const account = await createStaffAccount({
      name: String(body.name ?? ""),
      accountKey: String(body.accountKey ?? ""),
      role: body.role as (typeof FUTPREP_STAFF_ROLES)[number],
      pin: String(body.pin ?? ""),
    });
    return NextResponse.json({ ok: true, account, accounts: await listStaffAccounts() }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NAME_REQUIRED") return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    if (message === "INVALID_ACCOUNT_KEY") return NextResponse.json({ error: "Account name must be 3-40 characters: lowercase letters, numbers, - or _." }, { status: 400 });
    if (message === "INVALID_ROLE") return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
    if (message === "INVALID_PIN") return NextResponse.json({ error: "PIN must be at least 4 digits." }, { status: 400 });
    if (message === "ACCOUNT_KEY_TAKEN") return NextResponse.json({ error: "That account name is taken." }, { status: 409 });
    console.error("Futprep create account error", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await requireManager())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: number; active?: boolean };
  if (!Number.isInteger(body.id) || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await setStaffAccountActive(Number(body.id), body.active);
    return NextResponse.json({ ok: true, accounts: await listStaffAccounts() });
  } catch (error) {
    console.error("Futprep update account error", error);
    return NextResponse.json({ error: "Could not update the account." }, { status: 500 });
  }
}
