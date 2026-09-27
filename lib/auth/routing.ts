import type { OrgRole } from "@/db/accounts";
import type { Session } from "./session";
import { isSafeNext } from "./next";

export type Destination = {
  href: string;
  label: string;
  detail: string;
  kind: "admin" | "business" | "account";
};

const ROLE_LABEL: Record<OrgRole, string> = {
  org_owner: "Owner",
  org_admin: "Admin",
  org_staff: "Staff",
  org_viewer: "Viewer",
};

export function destinationsFor(session: Session): Destination[] {
  const out: Destination[] = [];
  if (session.platformRole) {
    out.push({ href: "/admin", label: "PortPass admin", detail: "Approvals, businesses, people", kind: "admin" });
  }
  for (const m of session.memberships) {
    if (!m.organizationSlug) continue;
    out.push({ href: `/business/${m.organizationSlug}`, label: m.organizationName, detail: ROLE_LABEL[m.role], kind: "business" });
  }
  out.push({ href: "/account", label: "My account", detail: "Your bookings and details", kind: "account" });
  return out;
}

// Where a freshly signed-in person lands. A safe ?next= wins (they were
// sent to sign in from somewhere specific). A business sign-up with no
// business yet goes to setup. One real place to be -> straight there.
// Several -> the "Where to?" chooser, unless they've chosen before and that
// choice still exists.
export function resolveDestination(
  session: Session,
  options: { next?: string | null; lastChoice?: string | null; intent?: string | null },
): string {
  if (isSafeNext(options.next)) return options.next;
  const destinations = destinationsFor(session);
  const primary = destinations.filter((d) => d.kind !== "account");
  if (options.intent === "business" && primary.length === 0) return "/business/setup";
  if (primary.length === 0) return "/account";
  if (primary.length === 1) return primary[0].href;
  if (options.lastChoice && destinations.some((d) => d.href === options.lastChoice)) return options.lastChoice;
  return "/where-to";
}

export const LAST_CHOICE_COOKIE = "pp_last_choice";
