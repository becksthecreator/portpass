import { NextResponse } from "next/server";
import { createPrivateSessionRequest } from "@/db/coaches";

export async function POST(request:Request){
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const requestType=body.requestType==="birthday"?"birthday":"private_lesson";
  const parentName=String(body.parentName??"").trim();
  const parentEmail=String(body.parentEmail??"").trim();
  const parentPhone=String(body.parentPhone??"").trim();
  const childName=String(body.childName??"").trim();
  const childAge=Number(body.childAge);
  const requestedDate=String(body.requestedDate??"");
  const requestedStartTime=String(body.requestedStartTime??"");
  const durationMinutes=Number(body.durationMinutes);
  if(!parentName||!parentEmail.includes("@")||!parentPhone||!childName||!Number.isInteger(childAge)||childAge<1||childAge>18||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(requestedDate)||!/^[0-9]{2}:[0-9]{2}$/.test(requestedStartTime)||![30,45,60,90,120].includes(durationMinutes)){
    return NextResponse.json({error:"Please complete the required session details."},{status:400});
  }
  if(requestedDate<new Date().toISOString().slice(0,10)) return NextResponse.json({error:"Choose a future date."},{status:400});
  try{
    const result=await createPrivateSessionRequest({
      requestType,
      preferredCoachId:Number(body.preferredCoachId)||null,
      parentName,parentEmail,parentPhone,childName,childAge,requestedDate,requestedStartTime,durationMinutes,
      locationPreference:String(body.locationPreference??""),
      sessionGoal:String(body.sessionGoal??""),
      notes:String(body.notes??""),
    });
    return NextResponse.json({ok:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:"Could not send request.";
    if(message==="PRIVATE_SESSIONS_MIGRATION_REQUIRED") return NextResponse.json({error:"Private-session booking is being connected. Please try again shortly."},{status:503});
    if(message==="COACH_NOT_AVAILABLE") return NextResponse.json({error:"That coach is not currently bookable. Choose another coach or Any available coach."},{status:409});
    return NextResponse.json({error:"Could not send the request."},{status:500});
  }
}
