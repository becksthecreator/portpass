import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffRole, canManageFutprepTeam } from "@/app/futprep/lil-kickers/staff-auth";
import { listAllCoachProfiles, saveCoachAvailability, saveCoachProfile, softDeleteCoach } from "@/db/coaches";

function csv(value:unknown){return String(value??"").split(",").map((v)=>v.trim()).filter(Boolean);}

export async function POST(request:Request){
  const account=await currentFutprepStaffAccount();
  const role=await currentFutprepStaffRole();
  if(!account||!role) return NextResponse.json({error:"Sign in again."},{status:401});
  if(!canManageFutprepTeam(role)) return NextResponse.json({error:"Only an admin or CEO can manage the team."},{status:403});
  const body=await request.json().catch(()=>({})) as any;
  try{
    if(body.action==="delete"){
      await softDeleteCoach(Number(body.id));
    }else if(body.action==="availability"){
      if(!body.coachId||!body.date||!body.startTime||!body.endTime) return NextResponse.json({error:"Complete the availability details."},{status:400});
      await saveCoachAvailability({coachId:Number(body.coachId),date:String(body.date),startTime:String(body.startTime),endTime:String(body.endTime),status:["available","blocked","booked"].includes(body.status)?body.status:"available",location:String(body.location??""),note:String(body.note??""),actor:account});
    }else if(body.action==="save"){
      if(!String(body.displayName??"").trim()||!String(body.slug??"").trim()) return NextResponse.json({error:"Name and slug are required."},{status:400});
      await saveCoachProfile({id:Number(body.id)||undefined,displayName:String(body.displayName),slug:String(body.slug),positionTitle:String(body.positionTitle||"Coach"),memberType:["coach","relations","admin"].includes(body.memberType)?body.memberType:"coach",bio:String(body.bio??""),licenses:csv(body.licenses),playedAt:csv(body.playedAt),favoritePlayer:String(body.favoritePlayer??""),favoriteTeam:String(body.favoriteTeam??""),photoUrl:String(body.photoUrl??""),introVideoUrl:String(body.introVideoUrl??""),testimonialQuote:String(body.testimonialQuote??""),testimonialName:String(body.testimonialName??""),publicVisible:Boolean(body.publicVisible),bookable:Boolean(body.bookable),sortOrder:Number(body.sortOrder)||100});
    }else return NextResponse.json({error:"Unknown team action."},{status:400});
    const result=await listAllCoachProfiles();
    return NextResponse.json({ok:true,coaches:result.coaches});
  }catch(error){
    const message=error instanceof Error?error.message:"Could not save.";
    if(message==="PRIVATE_SESSIONS_MIGRATION_REQUIRED") return NextResponse.json({error:"Run the Futprep coaches/private sessions migration first."},{status:503});
    return NextResponse.json({error:"Could not save team changes."},{status:500});
  }
}
