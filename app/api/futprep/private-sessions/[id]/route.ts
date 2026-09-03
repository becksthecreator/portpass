import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffRole } from "@/app/futprep/lil-kickers/staff-auth";
import { actOnPrivateSessionRequest, listPrivateSessionRequests } from "@/db/coaches";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const [account,role]=await Promise.all([currentFutprepStaffAccount(),currentFutprepStaffRole()]);
  if(!account||!role) return NextResponse.json({error:"Sign in again."},{status:401});
  const {id}=await params;
  const requestId=Number(id);
  const body=await request.json().catch(()=>({})) as any;
  if(!Number.isInteger(requestId)||requestId<1) return NextResponse.json({error:"Invalid request."},{status:400});
  if(!["accept","decline","refer","parent_notified","complete"].includes(body.action)) return NextResponse.json({error:"Invalid action."},{status:400});
  try{
    await actOnPrivateSessionRequest({id:requestId,action:body.action,coachId:Number(body.coachId)||null,targetCoachId:Number(body.targetCoachId)||null,reason:String(body.reason??""),actor:account});
    const result=await listPrivateSessionRequests();
    return NextResponse.json({ok:true,requests:result.requests});
  }catch(error){
    const message=error instanceof Error?error.message:"Could not update request.";
    if(message==="DECLINE_REASON_REQUIRED") return NextResponse.json({error:"A reason is required when declining a session."},{status:400});
    if(message==="COACH_REQUIRED") return NextResponse.json({error:"Choose a coach first."},{status:400});
    return NextResponse.json({error:"Could not update the session request."},{status:500});
  }
}
