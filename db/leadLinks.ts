import { logAudit } from "./audit";
import { getSupabaseAdmin } from "./supabase";

// When a business goes live, the lead it came from is marked live too, so
// the pipeline never has to be updated by hand (brief 08, 1.8). Kept apart
// from db/leads.ts, which imports db/business.ts: this file is called from
// there. A "do not contact" lead is never touched, and a failure here is
// logged and swallowed: it must not stop a business going live.
export async function markLeadsLive(organizationId: number, actorUserId: string | null): Promise<number> {
  try {
    const db = getSupabaseAdmin();
    const { data: leads, error } = await db.from("leads").select("id,status").eq("organization_id", organizationId).not("status", "in", "(live,do_not_contact)");
    if (error) throw new Error(error.message);
    let marked = 0;
    for (const lead of leads ?? []) {
      const { data: updated, error: updateError } = await db.from("leads").update({ status: "live", updated_at: new Date().toISOString() }).eq("id", lead.id).eq("status", lead.status).select("id").maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!updated) continue;
      marked += 1;
      await logAudit({ actorUserId, organizationId, action: "lead.status_changed", targetTable: "leads", targetId: Number(lead.id), before: { status: lead.status }, after: { status: "live" } });
    }
    return marked;
  } catch (error) {
    console.error("could not mark the lead live", error instanceof Error ? error.message : "");
    return 0;
  }
}
