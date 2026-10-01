import "server-only";
import { coachForStaffMember, type PayCoach } from "@/db/coachPay";
import { adminStepUp } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { currentFutprepStaffId, currentFutprepStaffName, currentFutprepStaffRole } from "../../staff-auth";

// Who may see coach pay (brief 13): Alex (the CEO login) and platform
// owners see everyone's; any other staff login sees only its own coach's
// pay, and never another coach's. A platform owner comes in on a PortPass
// sign-in rather than a staff PIN, so they must also have passed the
// authenticator step (the same rule as /admin and a business's pages);
// without it they are treated like anyone else and fall back to a staff
// login if they have one.
export type PayAccess =
  | { kind: "all"; actor: string }
  | { kind: "own"; actor: string; coach: PayCoach | null };

// A platform owner who has not entered an authenticator code yet: the pay
// page sends them to the verify screen instead of the staff PIN screen.
export async function payNeedsStepUp(): Promise<boolean> {
  const session = await getSession().catch(() => null);
  if (session?.platformRole !== "platform_owner") return false;
  const step = await adminStepUp();
  return !(step.aal2 && step.windowOpen);
}

export async function resolvePayAccess(): Promise<PayAccess | null> {
  const [role, staffId, name, session] = await Promise.all([
    currentFutprepStaffRole(),
    currentFutprepStaffId(),
    currentFutprepStaffName(),
    getSession().catch(() => null),
  ]);
  if (session?.platformRole === "platform_owner") {
    const step = await adminStepUp();
    if (step.aal2 && step.windowOpen) return { kind: "all", actor: session.email ?? "platform owner" };
  }
  if (!role || !staffId) return null;
  if (role === "ceo") return { kind: "all", actor: name ?? "ceo" };
  return { kind: "own", actor: name ?? role, coach: await coachForStaffMember(staffId) };
}
