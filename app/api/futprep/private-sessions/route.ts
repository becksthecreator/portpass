import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { createPrivateSessionRequest } from "@/db/coaches";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

// @public-route: parents request a private session or party here.
const limited = createRateLimiter(8, 10 * 60_000);

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["requestType", "serviceSlug", "childrenCount", "preferredCoachId", "availabilityId", "parentName", "parentEmail", "parentPhone", "childName", "childAge", "requestedDate", "requestedStartTime", "durationMinutes", "locationPreference", "sessionGoal", "notes"]);

export async function POST(request:Request){
  if(limited(clientIp(request))) return NextResponse.json({error:"Too many requests. Try again in a few minutes."},{status:429});
  const read=await readJson(request,Body);
  if(!read.ok) return read.response;
  const body:Record<string,unknown>=read.value;
  const requestType=body.requestType==="birthday"?"birthday":"private_lesson";
  const parentName=String(body.parentName??"").trim().slice(0,120);
  const parentEmail=String(body.parentEmail??"").trim().slice(0,180);
  const parentPhone=String(body.parentPhone??"").trim().slice(0,40);
  const childName=String(body.childName??"").trim().slice(0,120);
  const childAge=Number(body.childAge);
  const availabilityId=Number.isInteger(Number(body.availabilityId))&&Number(body.availabilityId)>0?Number(body.availabilityId):null;
  const serviceSlug=typeof body.serviceSlug==="string"&&body.serviceSlug?body.serviceSlug.slice(0,40):null;
  const requestedDate=String(body.requestedDate??"");
  const requestedStartTime=String(body.requestedStartTime??"");
  const durationMinutes=Number(body.durationMinutes);
  // A picked slot supplies the date and time; otherwise they are required.
  const timeOk=availabilityId!==null||(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(requestedDate)&&/^[0-9]{2}:[0-9]{2}$/.test(requestedStartTime));
  if(!parentName||!parentEmail.includes("@")||!parentPhone||!childName||!Number.isInteger(childAge)||childAge<1||childAge>18||!timeOk||![30,45,60,90,120].includes(durationMinutes)){
    return NextResponse.json({error:"Please complete the required session details."},{status:400});
  }
  if(availabilityId===null&&requestedDate<new Date().toISOString().slice(0,10)) return NextResponse.json({error:"Choose a future date."},{status:400});
  try{
    const result=await createPrivateSessionRequest({
      requestType,
      serviceSlug,
      availabilityId,
      preferredCoachId:Number(body.preferredCoachId)||null,
      parentName,parentEmail,parentPhone,childName,childAge,
      requestedDate:availabilityId?"1970-01-01":requestedDate,
      requestedStartTime:availabilityId?"00:00":requestedStartTime,
      durationMinutes,
      // Brief 13: a group session is priced per child (4 to 8).
      childrenCount:Number.isInteger(Number(body.childrenCount))&&Number(body.childrenCount)>0?Number(body.childrenCount):null,
      locationPreference:String(body.locationPreference??"").slice(0,200),
      sessionGoal:String(body.sessionGoal??"").slice(0,1000),
      notes:String(body.notes??"").slice(0,1000),
    });
    return NextResponse.json({ok:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:"Could not send request.";
    if(message==="PRIVATE_SESSIONS_MIGRATION_REQUIRED") return NextResponse.json({error:"Private-session booking is being connected. Please try again shortly."},{status:503});
    if(message==="COACH_NOT_AVAILABLE") return NextResponse.json({error:"That coach is not currently bookable. Choose another coach or Any available coach."},{status:409});
    if(message==="SERVICE_NOT_AVAILABLE") return NextResponse.json({error:"That service is not bookable online yet. Message Futprep on WhatsApp and we'll help."},{status:409});
    if(message==="SLOT_NOT_AVAILABLE") return NextResponse.json({error:"That time has just been taken. Choose another time or suggest one."},{status:409});
    if(message==="CHILDREN_OUT_OF_RANGE") return NextResponse.json({error:"A group session is for 4 to 8 children. For 1, 2 or 3 children choose that session instead."},{status:400});
    console.error("private session request error",error);
    return NextResponse.json({error:"Could not send the request."},{status:500});
  }
}
