import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// "Sign out everywhere" (Brief 21, part C): ends every session the signed-in
// person has, on every device, at once. The same database function Admin ->
// People uses to sign someone out (admin_revoke_sessions, 202610060001),
// here for a person's own account. Their next request on any device is
// refused and they sign in again; nothing else about the account changes.
export async function endOwnSessions(userId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("admin_revoke_sessions", { p_user_id: userId });
  throwIfSupabaseError(error, "Could not end the sessions");
  const ended = Number(data) || 0;
  try {
    await logAudit({ actorUserId: userId, action: "user.signed_out_everywhere", targetTable: "auth.users", targetId: userId, after: { sessions_ended: ended } });
  } catch (auditError) {
    console.error("user.signed_out_everywhere audit failed", auditError instanceof Error ? auditError.message : "");
  }
  return ended;
}
