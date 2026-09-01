import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import { saveFutprepWorkLog } from "@/db/staff";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const role = await currentFutprepStaffRole();
  if (role !== "coach" && role !== "ceo") {
    return NextResponse.json({ error: "Coach or CEO access required." }, { status: 403 });
  }
  const { id } = await context.params;
  const sessionId=Number(id);
  if (!Number.isInteger(sessionId)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });

  const body=await request.json().catch(()=>({})) as {
    workDate?:string; startTime?:string; endTime?:string; hours?:number; notes?:string;
  };
  const workDate=String(body.workDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return NextResponse.json({error:"Choose a valid work date."},{status:400});
  }

  try {
    await saveFutprepWorkLog({
      sessionId,
      staffName:"Coach Bex",
      workDate,
      startTime:String(body.startTime ?? "").slice(0,8),
      endTime:String(body.endTime ?? "").slice(0,8),
      hours:Number(body.hours ?? 0),
      notes:String(body.notes ?? "").trim().slice(0,2000),
    });
    return NextResponse.json({ok:true});
  } catch (error) {
    const message=error instanceof Error ? error.message : "";
    return NextResponse.json({
      error: message==="STAFF_TOOLS_MIGRATION_REQUIRED"
        ? "Work logs need the new PortPass database update before they can save."
        : message==="INVALID_HOURS"
          ? "Hours worked must be between 0 and 24."
          : "Could not save work hours."
    },{status:400});
  }
}
