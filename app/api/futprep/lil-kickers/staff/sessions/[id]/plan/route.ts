import { NextResponse } from "next/server";
import { currentFutprepStaffRole, currentFutprepStaffName } from "@/app/futprep/lil-kickers/staff-auth";
import { saveFutprepSessionPlan } from "@/db/staff";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "coach" && role !== "ceo") {
    return NextResponse.json({ error: "Coach or CEO access required." }, { status: 403 });
  }
  const updatedBy = (await currentFutprepStaffName()) ?? role;
  const { id } = await context.params;
  const sessionId=Number(id);
  if (!Number.isInteger(sessionId)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });

  const body=await request.json().catch(()=>({})) as {
    title?:string; planText?:string; parentNote?:string; attachmentUrl?:string;
  };
  const attachmentUrl=String(body.attachmentUrl ?? "").trim();
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl)) {
    return NextResponse.json({ error: "Plan link must start with http:// or https://." }, { status: 400 });
  }

  try {
    await saveFutprepSessionPlan({
      sessionId,
      title:String(body.title ?? "").trim().slice(0,160),
      planText:String(body.planText ?? "").trim().slice(0,12000),
      parentNote:String(body.parentNote ?? "").trim().slice(0,2000),
      attachmentUrl:attachmentUrl.slice(0,1000),
      updatedBy,
    });
    return NextResponse.json({ok:true});
  } catch (error) {
    const message=error instanceof Error ? error.message : "";
    return NextResponse.json({
      error: message==="STAFF_TOOLS_MIGRATION_REQUIRED"
        ? "Session tools need the new PortPass database update before they can save."
        : "Could not save session plan."
    },{status:400});
  }
}
