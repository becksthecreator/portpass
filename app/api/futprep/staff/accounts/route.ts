import { NextResponse } from "next/server";
import {
  currentFutprepStaffName,
  currentFutprepStaffRole,
  canManageFutprepTeam,
  assignStaffLogin,
  createStaffAccount,
  listStaffAccounts,
  listStaffWithoutLogin,
  setStaffAccountActive,
  setStaffCanViewMedical,
  FUTPREP_STAFF_ROLES,
} from "@/app/futprep/staff-auth";
import { futprepOwnerStaffState, revokeFutprepOwnerGrant, setFutprepStaffEmail } from "@/db/futprepOwner";
import { bodyOf, readJson } from "@/lib/api/body";
import { canSetMedicalSwitch } from "@/lib/futprepRoles";

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

type Role = (typeof FUTPREP_STAFF_ROLES)[number];
const isRole = (value: unknown): value is Role => typeof value === "string" && (FUTPREP_STAFF_ROLES as string[]).includes(value);

// Every login, the people without one, and where the owner mark stands
// (brief 31), so the screen never shows owner access that was taken back.
async function everyone() {
  const [accounts, withoutLogin, owner] = await Promise.all([listStaffAccounts(), listStaffWithoutLogin(), futprepOwnerStaffState()]);
  return { accounts, withoutLogin, ownerStates: owner ? { [owner.staffId]: owner.state } : {} };
}

function loginError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "NAME_REQUIRED") return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  if (message === "INVALID_ACCOUNT_KEY") return NextResponse.json({ error: "Account name must be 3-40 characters: lowercase letters, numbers, - or _." }, { status: 400 });
  if (message === "INVALID_ROLE") return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  if (message === "INVALID_PIN") return NextResponse.json({ error: "PIN must be at least 6 digits." }, { status: 400 });
  if (message === "ACCOUNT_KEY_TAKEN") return NextResponse.json({ error: "That account name is taken." }, { status: 409 });
  if (message === "ROW_NOT_FOUND") return NextResponse.json({ error: "That person already has a login, or isn't on the team any more." }, { status: 404 });
  console.error("Futprep account error", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET() {
  if (!(await requireManager())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  try {
    return NextResponse.json(await everyone());
  } catch (error) {
    console.error("Futprep list accounts error", error);
    return NextResponse.json({ error: "Could not load staff accounts." }, { status: 500 });
  }
}

// A new login (a new staff row), or (brief 31, A3) a login for someone
// already on the team who has none yet, so the person keeps one row.
const PostBody = bodyOf(["action", "id", "name", "accountKey", "role", "pin"]);

export async function POST(request: Request) {
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const read = await readJson(request, PostBody);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRole(body.role)) return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  if (body.role === "ceo" && manager !== "ceo") return NextResponse.json({ error: CEO_ONLY }, { status: 403 });

  if (body.action === "login") {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    try {
      const target = (await listStaffWithoutLogin()).find((row) => row.id === id);
      if (!target) return NextResponse.json({ error: "That person already has a login, or isn't on the team any more." }, { status: 404 });
      if (target.role === "ceo" && manager !== "ceo") return NextResponse.json({ error: CEO_ONLY }, { status: 403 });
      const actorName = (await currentFutprepStaffName()) ?? manager;
      const account = await assignStaffLogin({ id, accountKey: String(body.accountKey ?? ""), role: body.role, pin: String(body.pin ?? ""), actorName });
      return NextResponse.json({ ok: true, account, ...(await everyone()) }, { status: 201 });
    } catch (error) {
      return loginError(error, "Could not give the login.");
    }
  }
  if (body.action !== undefined) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const account = await createStaffAccount({
      name: String(body.name ?? ""),
      accountKey: String(body.accountKey ?? ""),
      role: body.role,
      pin: String(body.pin ?? ""),
    });
    return NextResponse.json({ ok: true, account, ...(await everyone()) }, { status: 201 });
  } catch (error) {
    return loginError(error, "Could not create the account.");
  }
}

// Switch a login off or on, set where its reminders are emailed, or
// (brief 31, A1) switch an admin or coach login's medical view: the owner
// only. Changing a login's email takes back any owner access a founder
// gave from it in the same transaction; switching a login off takes it
// back straight after (db/futprepOwner.ts), and again on a retry.
const PatchBody = bodyOf(["id", "active", "email", "canViewMedical"]);

export async function PATCH(request: Request) {
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const read = await readJson(request, PatchBody);
  if (!read.ok) return read.response;
  const body = read.value;
  const hasEmail = body.email !== undefined;
  const hasMedical = typeof body.canViewMedical === "boolean";
  if (!Number.isInteger(body.id) || (!hasEmail && !hasMedical && typeof body.active !== "boolean")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  let email: string | null = null;
  if (hasEmail) {
    const typed = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    if (typed && !EMAIL_PATTERN.test(typed)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
    email = typed || null;
  }
  if (hasMedical && !canSetMedicalSwitch(manager)) return NextResponse.json({ error: "Only the CEO login can change who sees medical details." }, { status: 403 });

  try {
    const target = (await listStaffAccounts()).find((account) => account.id === Number(body.id));
    if (!target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (target.role === "ceo" && manager !== "ceo") return NextResponse.json({ error: CEO_ONLY }, { status: 403 });
    const actor = (await currentFutprepStaffName()) ?? manager;
    if (hasMedical) {
      if (target.role !== "admin" && target.role !== "coach") return NextResponse.json({ error: "The switch is for admin and coach logins: the CEO always sees medical details, helpers never do." }, { status: 400 });
      await setStaffCanViewMedical(target.id, body.canViewMedical as boolean, actor);
    } else if (hasEmail) {
      await setFutprepStaffEmail({ staffId: target.id, email, actor });
    } else {
      // Off first, so a founder's grant can't land on it in between.
      await setStaffAccountActive(target.id, Boolean(body.active));
      if (body.active === false) await revokeFutprepOwnerGrant({ staffId: target.id, reason: "login_switched_off", actor });
    }
    return NextResponse.json({ ok: true, ...(await everyone()) });
  } catch (error) {
    console.error("Futprep update account error", error);
    return NextResponse.json({ error: "Could not update the account." }, { status: 500 });
  }
}
