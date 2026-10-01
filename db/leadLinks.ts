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
    // The lead is linked to the business when its page is drafted. A
    // business drafted from a get listed request before that link existed
    // is matched through the request instead.
    const { data: organization, error: organizationError } = await db.from("organizations").select("application_id").eq("id", organizationId).maybeSingle();
    if (organizationError) throw new Error(organizationError.message);
    const applicationId = Number.isInteger(Number(organization?.application_id)) && Number(organization?.application_id) > 0 ? Number(organization?.application_id) : null;
    let query = db.from("leads").select("id,status").not("status", "in", "(live,do_not_contact)");
    query = applicationId ? query.or(`organization_id.eq.${organizationId},and(application_id.eq.${applicationId},organization_id.is.null)`) : query.eq("organization_id", organizationId);
    const { data: leads, error } = await query;
    if (error) throw new Error(error.message);
    let marked = 0;
    for (const lead of leads ?? []) {
      const { data: updated, error: updateError } = await db.from("leads").update({ status: "live", organization_id: organizationId, updated_at: new Date().toISOString() }).eq("id", lead.id).eq("status", lead.status).select("id").maybeSingle();
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

// A get listed request turned into a draft business: the lead that request
// made is linked to the draft and moves to "page drafted", so the pipeline
// shows it and it follows the business live. Same rules as above: never a
// "do not contact" lead, and a failure never stops the draft being made.
export async function linkLeadToDraft(applicationId: number, organizationId: number, actorUserId: string | null): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const { data: leads, error } = await db.from("leads").select("id,status").eq("application_id", applicationId).is("organization_id", null).not("status", "in", "(live,do_not_contact)");
    if (error) throw new Error(error.message);
    for (const lead of leads ?? []) {
      const { data: updated, error: updateError } = await db.from("leads").update({ organization_id: organizationId, status: "page_drafted", updated_at: new Date().toISOString() }).eq("id", lead.id).eq("status", lead.status).is("organization_id", null).select("id").maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (updated && lead.status !== "page_drafted") await logAudit({ actorUserId, organizationId, action: "lead.status_changed", targetTable: "leads", targetId: Number(lead.id), before: { status: lead.status }, after: { status: "page_drafted" } });
    }
  } catch (error) {
    console.error("could not link the lead to its draft", error instanceof Error ? error.message : "");
  }
}
