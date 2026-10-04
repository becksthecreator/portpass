import "server-only";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole, requireFutprepStaff } from "@/app/futprep/staff-auth";
import { getOrganizationSummary } from "@/db/accounts";
import { memberCanManagePayments, type Actor } from "@/db/paymentRequests";
import type { DemoBusiness } from "@/db/demo";
import { currentDemo, demoSwitchedOff } from "@/lib/auth/demo";
import { hasPlatformRole, requireOrgRoleApi, type OrgAccess } from "@/lib/auth/guards";
import { isPaymentErrorCode, paymentErrorMessage } from "./input";
import { memberHandlesPayments } from "./rules";

// Who may handle a business's payment requests (brief 17): its owner, its
// admins, staff an owner has given the payments permission, and PortPass
// platform owners (through the platform door, with the second sign-in
// step). Futprep's staff still sign in with a PIN, so its admin and CEO
// logins reach Futprep's payments through a second door. Nobody else, and
// never another business's requests.
//
// The third door is the demo (brief 18, part B): a visitor with a demo
// session reaches the demo business's requests, and only those. They can
// press the buttons (send, remind, mark paid) so the screens behave as they
// do for a real business, but no message is ever sent, nothing typed is
// kept, and how the business is paid can't be changed.

export type PaymentsAccess = {
  orgId: number;
  orgName: string;
  orgSlug: string | null;
  door: "business" | "futprep_staff" | "demo";
  actor: Actor;
  // The signed-in person's own account email (a PIN login has none): the
  // only address a TEST request is ever sent to.
  actorEmail: string | null;
  // Where customers send money: the owner (or a platform owner), or
  // Futprep's admin and CEO logins.
  canEditSettings: boolean;
  // Who else handles payments: owners and platform owners only.
  canManageTeam: boolean;
  basePath: string;
};

const FUTPREP_SLUG = "futprep";

export async function handlesPayments(access: OrgAccess): Promise<boolean> {
  if (access.via === "platform" || !access.membership) return hasPlatformRole(access.session, "platform_owner");
  const { role } = access.membership;
  const canManagePayments = role === "org_staff" ? await memberCanManagePayments(access.org.id, access.session.userId) : false;
  return memberHandlesPayments({ role, canManagePayments });
}

function businessAccess(access: OrgAccess): PaymentsAccess {
  const owner = access.via === "platform" || access.membership?.role === "org_owner";
  return {
    orgId: access.org.id,
    orgName: access.org.name,
    orgSlug: access.org.slug,
    door: "business",
    actor: { userId: access.session.userId, name: access.session.profile?.fullName?.trim() || access.session.email || "Team member" },
    actorEmail: access.session.email,
    canEditSettings: owner,
    canManageTeam: owner,
    basePath: `/business/${access.org.slug}/payments`,
  };
}

async function futprepAccess(role: string): Promise<PaymentsAccess | null> {
  const org = await getOrganizationSummary({ slug: FUTPREP_SLUG });
  if (!org) return null;
  const name = (await currentFutprepStaffName()) ?? `Futprep ${role}`;
  return {
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    door: "futprep_staff",
    actor: { userId: null, name },
    actorEmail: null,
    canEditSettings: true,
    canManageTeam: false,
    basePath: "/futprep/staff/payments",
  };
}

export const DEMO_ACTOR: Actor = { userId: null, name: "Demo visitor" };

// The demo door. Callers get `org` from requireDemo / currentDemo, which
// only ever hand back the business with is_demo set.
export function demoPaymentsAccess(org: DemoBusiness): PaymentsAccess {
  return {
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    door: "demo",
    actor: DEMO_ACTOR,
    actorEmail: null,
    canEditSettings: false,
    canManageTeam: false,
    basePath: "/demo/payments",
  };
}

// ---- pages -------------------------------------------------------------------

// The page calls requireOrgRole itself (so lib/auth/guards.static.test.ts
// sees the guard); this adds the payments permission on top.
export async function businessPaymentsAccess(access: OrgAccess): Promise<PaymentsAccess> {
  if (!(await handlesPayments(access))) notFound();
  return businessAccess(access);
}

export async function futprepPaymentsAccess(returnTo: string): Promise<PaymentsAccess> {
  const role = await requireFutprepStaff(["admin", "ceo"], returnTo);
  const access = await futprepAccess(role);
  if (!access) notFound();
  return access;
}

// ---- route handlers ------------------------------------------------------------

type Denied = { ok: false; response: NextResponse };

// `demo`: whether this handler is one a demo visitor may use. Most are not
// (changing how the business is paid, the team, exports, new requests typed
// by hand): they answer "switched off in the demo" before doing anything.
export async function paymentsApiAccess(orgId: number, options: { demo?: boolean } = {}): Promise<{ ok: true; access: PaymentsAccess } | Denied> {
  // A demo session is good for the demo business only: for any other id it
  // is ignored, and the request is judged by who is really signed in.
  const demo = await currentDemo();
  if (demo && demo.id === orgId) {
    if (!options.demo) return { ok: false, response: demoSwitchedOff() };
    return { ok: true, access: demoPaymentsAccess(demo) };
  }
  const staffRole = await currentFutprepStaffRole();
  if (staffRole === "admin" || staffRole === "ceo") {
    const access = await futprepAccess(staffRole);
    if (access && access.orgId === orgId) return { ok: true, access };
  }
  const auth = await requireOrgRoleApi(orgId, "org_staff");
  if (!auth.ok) return auth;
  if (!(await handlesPayments(auth))) return { ok: false, response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return { ok: true, access: businessAccess(auth) };
}

export async function orgIdFrom(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function positiveId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const NOT_FOUND_CODES = new Set(["NOT_FOUND", "LINK_NOT_FOUND"]);
const CONFLICT_CODES = new Set(["VOID", "ALREADY_PAID", "HAS_PAYMENTS", "ALREADY_REFUNDED"]);

// A refusal the screen can show in words, or a logged 500.
export function paymentRouteError(error: unknown, context: string): NextResponse {
  const code = error instanceof Error ? error.message : "";
  if (isPaymentErrorCode(code)) {
    const status = NOT_FOUND_CODES.has(code) ? 404 : CONFLICT_CODES.has(code) ? 409 : 400;
    return NextResponse.json({ error: paymentErrorMessage(code), code }, { status });
  }
  console.error(context, error instanceof Error ? error.message : "");
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
