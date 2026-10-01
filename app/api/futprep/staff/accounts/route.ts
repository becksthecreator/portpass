import { NextResponse } from "next/server";
import {
  currentFutprepStaffRole,
  canManageFutprepTeam,
  createStaffAccount,
  listStaffAccounts,
  setStaffAccountActive,
  setStaffAccountEmail,
  FUTPREP_STAFF_ROLES,
} from "@/app/futprep/staff-auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireManager() {
  const role = await currentFutprepStaffRole();
  if (!role || !canManageFutprepTeam(role)) return null;
  return role;
}

// The CEO login opens everything, coach pay included (brief 13: pay is for
// Alex and platform owners only). So only a CEO may create a CEO login or
// switch one off or on; the registration desk manages every other login.
const CEO_ONLY = "Only the CEO login can create or change a CEO login.";

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
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: string; accountKey?: string; role?: string; pin?: string };
  if (!body.role || !(FUTPREP_STAFF_ROLES as string[]).includes(body.role)) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  }
  if (body.role === "ceo" && manager !== "ceo") return NextResponse.json({ error: CEO_ONLY }, { status: 403 });

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
    if (message === "INVALID_PIN") return NextResponse.json({ error: "PIN must be at least 6 digits." }, { status: 400 });
    if (message === "ACCOUNT_KEY_TAKEN") return NextResponse.json({ error: "That account name is taken." }, { status: 409 });
    console.error("Futprep create account error", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: number; active?: boolean; email?: unknown };
  // Either switch a login off or on, or set where its reminders are emailed.
  const hasEmail = body.email !== undefined;
  if (!Number.isInteger(body.id) || (!hasEmail && typeof body.active !== "boolean")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  let email: string | null = null;
  if (hasEmail) {
    const typed = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    if (typed && !EMAIL_PATTERN.test(typed)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
    email = typed || null;
  }

  try {
    const target = (await listStaffAccounts()).find((account) => account.id === Number(body.id));
    if (!target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (target.role === "ceo" && manager !== "ceo") return NextResponse.json({ error: CEO_ONLY }, { status: 403 });
    if (hasEmail) await setStaffAccountEmail(Number(body.id), email);
    else await setStaffAccountActive(Number(body.id), Boolean(body.active));
    return NextResponse.json({ ok: true, accounts: await listStaffAccounts() });
  } catch (error) {
    console.error("Futprep update account error", error);
    return NextResponse.json({ error: "Could not update the account." }, { status: 500 });
  }
}
