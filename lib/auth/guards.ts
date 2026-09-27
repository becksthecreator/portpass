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
  return { session, org, membership, canViewMedical: membership ? canViewMedical(membership) : false };
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
  return { ok: true, ...access };
}
