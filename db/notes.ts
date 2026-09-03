import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type FutprepNoteCategory =
  | "product"
  | "operations"
  | "content"
  | "lead"
  | "brand"
  | "issue"
  | "idea";

export type FutprepNoteStatus = "inbox" | "actioned" | "archived";
export type FutprepNotePriority = "normal" | "high";

export type FutprepNote = {
  id:number;
  title:string;
  body:string;
  category:FutprepNoteCategory;
  priority:FutprepNotePriority;
  status:FutprepNoteStatus;
  created_by:string;
  created_at:string;
  updated_at:string;
};

const fallbackNotes:FutprepNote[] = [
  {
    id:-1,
    title:"Coach marketplace + private sessions",
    body:"Build coaches, availability, private lessons, birthdays, accept/decline/referral flow, and parent confirmation as one connected Futprep operations system.",
    category:"product",
    priority:"high",
    status:"inbox",
    created_by:"Adon + Antonio",
    created_at:"2026-09-03T19:20:00.000Z",
    updated_at:"2026-09-03T19:20:00.000Z",
  },
  {
    id:-2,
    title:"Futprep brand revamp",
    body:"Re-establish how Futprep is presented publicly. Coach profiles, player journeys, testimonials, photos and videos should double as a reusable content bank for the relaunch.",
    category:"brand",
    priority:"high",
    status:"inbox",
    created_by:"Adon + Antonio",
    created_at:"2026-09-03T19:21:00.000Z",
    updated_at:"2026-09-03T19:21:00.000Z",
  },
  {
    id:-3,
    title:"Renegades FC opportunity",
    body:"Potential PortPass + consulting lead. Renegades reportedly needs a rebrand, new coaches and more youth recruitment. There are also privately reported organizational challenges; verify details before any external use or outreach.",
    category:"lead",
    priority:"high",
    status:"inbox",
    created_by:"Adon",
    created_at:"2026-09-03T19:22:00.000Z",
    updated_at:"2026-09-03T19:22:00.000Z",
  },
  {
    id:-4,
    title:"Carvmindset / Jason",
    body:"Warm lead. Antonio knows Jason from playing against him in the Bahamas soccer league, and both previously coached for Renegades. Jason is CEO of Carvmindset. Awaiting links/details for deeper research and an outreach strategy.",
    category:"lead",
    priority:"high",
    status:"inbox",
    created_by:"Antonio",
    created_at:"2026-09-03T19:23:00.000Z",
    updated_at:"2026-09-03T19:23:00.000Z",
  },
  {
    id:-5,
    title:"The Beckfords consulting position",
    body:"Position Antonio and Adon as practical consultants who identify inefficiencies inside companies, design the fix, and help execute the solution rather than only giving advice.",
    category:"idea",
    priority:"high",
    status:"inbox",
    created_by:"Antonio + Adon",
    created_at:"2026-09-03T19:24:00.000Z",
    updated_at:"2026-09-03T19:24:00.000Z",
  },
];

function isMissingTable(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "42P01" || /does not exist/i.test(value?.message ?? "");
}

async function futprepOrganizationId() {
  const db=getSupabaseAdmin();
  const {data,error}=await db
    .from("organizations")
    .select("id,name")
    .or("name.ilike.%futprep%,name.ilike.%footprep%")
    .order("id",{ascending:true})
    .limit(1);
  throwIfSupabaseError(error,"Could not locate Futprep organization");
  return data?.[0]?.id ? Number(data[0].id) : null;
}

export async function listFutprepNotes():Promise<{schemaReady:boolean;notes:FutprepNote[]}>{
  const organizationId=await futprepOrganizationId();
  if(!organizationId) return {schemaReady:true,notes:[]};

  const db=getSupabaseAdmin();
  const {data,error}=await db
    .from("futprep_notes")
    .select("id,title,body,category,priority,status,created_by,created_at,updated_at")
    .eq("organization_id",organizationId)
    .order("created_at",{ascending:false});

  if(isMissingTable(error)) return {schemaReady:false,notes:fallbackNotes};
  throwIfSupabaseError(error,"Could not load Futprep notes");
  return {schemaReady:true,notes:(data??[]) as FutprepNote[]};
}

export async function createFutprepNote(input:{
  title:string;
  body:string;
  category:FutprepNoteCategory;
  priority:FutprepNotePriority;
  createdBy:string;
}) {
  const organizationId=await futprepOrganizationId();
  if(!organizationId) throw new Error("FUTPREP_NOT_FOUND");

  const db=getSupabaseAdmin();
  const {error}=await db.from("futprep_notes").insert({
    organization_id:organizationId,
    title:input.title.trim(),
    body:input.body.trim(),
    category:input.category,
    priority:input.priority,
    status:"inbox",
    created_by:input.createdBy,
    updated_at:new Date().toISOString(),
  });

  if(isMissingTable(error)) throw new Error("NOTES_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not save Futprep note");
}

export async function updateFutprepNote(input:{
  id:number;
  status?:FutprepNoteStatus;
  priority?:FutprepNotePriority;
}) {
  const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(input.status) patch.status=input.status;
  if(input.priority) patch.priority=input.priority;

  const db=getSupabaseAdmin();
  const {error}=await db.from("futprep_notes").update(patch).eq("id",input.id);
  if(isMissingTable(error)) throw new Error("NOTES_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not update Futprep note");
}
