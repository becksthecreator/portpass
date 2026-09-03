import { NextResponse } from "next/server";
import { currentFutprepStaffAccount } from "@/app/futprep/lil-kickers/staff-auth";
import {
  createFutprepNote,
  listFutprepNotes,
  updateFutprepNote,
  type FutprepNoteCategory,
  type FutprepNotePriority,
  type FutprepNoteStatus,
} from "@/db/notes";

const categories:FutprepNoteCategory[]=["product","operations","content","lead","brand","issue","idea"];
const priorities:FutprepNotePriority[]=["normal","high"];
const statuses:FutprepNoteStatus[]=["inbox","actioned","archived"];

export async function GET() {
  const account=await currentFutprepStaffAccount();
  if(!account) return NextResponse.json({error:"Staff access required."},{status:403});
  const result=await listFutprepNotes();
  return NextResponse.json(result);
}

export async function POST(request:Request) {
  const account=await currentFutprepStaffAccount();
  if(!account) return NextResponse.json({error:"Staff access required."},{status:403});

  const body=await request.json().catch(()=>({})) as {
    title?:string;
    body?:string;
    category?:string;
    priority?:string;
  };
  const title=String(body.title??"").trim();
  const noteBody=String(body.body??"").trim();
  if(!title || !noteBody) return NextResponse.json({error:"Add a title and note."},{status:400});
  if(!categories.includes(body.category as FutprepNoteCategory)) return NextResponse.json({error:"Choose a valid category."},{status:400});
  if(!priorities.includes(body.priority as FutprepNotePriority)) return NextResponse.json({error:"Choose a valid priority."},{status:400});

  try{
    await createFutprepNote({
      title,
      body:noteBody,
      category:body.category as FutprepNoteCategory,
      priority:body.priority as FutprepNotePriority,
      createdBy:account,
    });
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof Error && error.message==="NOTES_MIGRATION_REQUIRED"){
      return NextResponse.json({error:"The notes database migration still needs to be run."},{status:503});
    }
    return NextResponse.json({error:"Could not save the note."},{status:500});
  }
}

export async function PATCH(request:Request) {
  const account=await currentFutprepStaffAccount();
  if(!account) return NextResponse.json({error:"Staff access required."},{status:403});

  const body=await request.json().catch(()=>({})) as {
    id?:number;
    status?:string;
    priority?:string;
  };
  const id=Number(body.id);
  if(!Number.isInteger(id) || id<=0) return NextResponse.json({error:"Invalid note."},{status:400});
  if(body.status && !statuses.includes(body.status as FutprepNoteStatus)) return NextResponse.json({error:"Invalid note status."},{status:400});
  if(body.priority && !priorities.includes(body.priority as FutprepNotePriority)) return NextResponse.json({error:"Invalid priority."},{status:400});

  try{
    await updateFutprepNote({
      id,
      status:body.status as FutprepNoteStatus|undefined,
      priority:body.priority as FutprepNotePriority|undefined,
    });
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof Error && error.message==="NOTES_MIGRATION_REQUIRED"){
      return NextResponse.json({error:"The notes database migration still needs to be run."},{status:503});
    }
    return NextResponse.json({error:"Could not update the note."},{status:500});
  }
}
