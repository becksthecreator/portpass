import "server-only";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { canViewMedical, getOrganizationSummary, type Membership, type OrganizationSummary, type OrgRole, type PlatformRole } from "@/db/accounts";
import { getSession, type Session } from "./session";

// Every protected page and route handler goes through one of these. Roles
// come from the session (lib/auth/session.ts), never from the request.
// Pages: no session -> /login?next=; signed in but not allowed -> 404, so
// a URL never confirms that a business or admin area exists. Route
// handlers: 401 / 403 JSON instead.

const PLATFORM_RANK: Record<PlatformRole, number> = { platform_admin: 1, platform_owner: 2 };
const ORG_RANK: Record<OrgRole, number> = { org_viewer: 1, org_staff: 2, org_admin: 3, org_owner: 4 };

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export function hasPlatformRole(session: Session, min: PlatformRole): boolean {
  return session.platformRole !== null && PLATFORM_RANK[session.platformRole] >= PLATFORM_RANK[min];
}

export type OrgAccess = {
  session: Session;
  org: OrganizationSummary;
  membership: Membership | null;
  canViewMedical: boolean;
  // How this person got in: their own membership of the business, or the
  // PortPass platform role. The platform door needs the second sign-in step.
  via: "membership" | "platform";
};

async function orgAccess(session: Session, orgRef: number | { slug: string }, min: OrgRole): Promise<OrgAccess | null> {
  const org = await getOrganizationSummary(orgRef);
  if (!org) return null;
  const membership = session.memberships.find((m) => m.organizationId === org.id) ?? null;
  const allowedByMembership = membership !== null && ORG_RANK[membership.role] >= ORG_RANK[min];
  // Platform staff can reach every business, but never see medical details
  // through that door -- only a real membership grants that.
  const allowedByPlatform = hasPlatformRole(session, "platform_admin");
  if (!allowedByMembership && !allowedByPlatform) return null;
  return { session, org, membership, canViewMedical: membership ? canViewMedical(membership) : false, via: allowedByMembership ? "membership" : "platform" };
}

// PortPass staff reach a business through their platform role, and from
// there can change its details, team and bank-transfer details. That door
// gets the same two-step check as the admin area (an authenticator code
// within the last 12 hours); a business's own members are unaffected.
// Imported lazily: lib/auth/admin.ts itself imports this module.
async function platformStepUpMissing(access: OrgAccess): Promise<string | null> {
  if (access.via !== "platform") return null;
  const { adminStepUp, ADMIN_MFA_PATH } = await import("./admin");
  const step = await adminStepUp();
  return step.aal2 && step.windowOpen ? null : ADMIN_MFA_PATH;
}

// ---- pages ---------------------------------------------------------------

export async function requireSignedIn(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginHref(returnTo));
  return session;
}

export async function requirePlatformRole(min: PlatformRole, returnTo: string): Promise<Session> {
  const session = await requireSignedIn(returnTo);
  if (!hasPlatformRole(session, min)) notFound();
  return session;
}

export async function requireOrgRole(orgRef: number | { slug: string }, min: OrgRole, returnTo: string): Promise<OrgAccess> {
  const session = await requireSignedIn(returnTo);
  const access = await orgAccess(session, orgRef, min);
  if (!access) notFound();
  const verifyPath = await platformStepUpMissing(access);
  if (verifyPath) redirect(`${verifyPath}?next=${encodeURIComponent(returnTo)}`);
  return access;
}

// ---- route handlers -------------------------------------------------------

type ApiDenied = { ok: false; response: NextResponse };

export async function requireSignedInApi(): Promise<{ ok: true; session: Session } | ApiDenied> {
  const session = await getSession();
  if (!session) return { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  return { ok: true, session };
}

export async function requirePlatformRoleApi(min: PlatformRole): Promise<{ ok: true; session: Session } | ApiDenied> {
  const signedIn = await requireSignedInApi();
  if (!signedIn.ok) return signedIn;
  if (!hasPlatformRole(signedIn.session, min)) return { ok: false, response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return signedIn;
}

export async function requireOrgRoleApi(orgRef: number | { slug: string }, min: OrgRole): Promise<({ ok: true } & OrgAccess) | ApiDenied> {
  const signedIn = await requireSignedInApi();
  if (!signedIn.ok) return signedIn;
  const access = await orgAccess(signedIn.session, orgRef, min);
  if (!access) return { ok: false, response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  const verifyPath = await platformStepUpMissing(access);
  if (verifyPath) {
    return { ok: false, response: NextResponse.json({ error: "Two-step verification required.", code: "mfa_required", verify: verifyPath }, { status: 403 }) };
  }
  return { ok: true, ...access };
}
