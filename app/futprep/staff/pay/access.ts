import "server-only";
import { coachForStaffMember, type PayCoach } from "@/db/coachPay";
import { getSession } from "@/lib/auth/session";
import { currentFutprepStaffId, currentFutprepStaffName, currentFutprepStaffRole } from "../../staff-auth";

// Who may see coach pay (brief 13): Alex (the CEO login) and platform
// owners see everyone's; any other staff login sees only its own coach's
// pay, and never another coach's.
export type PayAccess =
  | { kind: "all"; actor: string }
  | { kind: "own"; actor: string; coach: PayCoach | null };

export async function resolvePayAccess(): Promise<PayAccess | null> {
  const [role, staffId, name, session] = await Promise.all([
    currentFutprepStaffRole(),
    currentFutprepStaffId(),
    currentFutprepStaffName(),
    getSession().catch(() => null),
  ]);
  if (session?.platformRole === "platform_owner") return { kind: "all", actor: session.email ?? "platform owner" };
  if (!role || !staffId) return null;
  if (role === "ceo") return { kind: "all", actor: name ?? "ceo" };
  return { kind: "own", actor: name ?? role, coach: await coachForStaffMember(staffId) };
}
