import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type CoachAvailability = {
  id: number;
  coach_id: number;
  availability_date: string;
  start_time: string;
  end_time: string;
  status: "available" | "blocked" | "booked";
  location: string;
  note: string;
};

export type CoachProfile = {
  id: number;
  organization_id: number;
  slug: string;
  display_name: string;
  position_title: string;
  member_type: "coach" | "relations" | "admin";
  bio: string;
  licenses: string[];
  played_at: string[];
  favorite_player: string | null;
  favorite_team: string | null;
  photo_url: string | null;
  intro_video_url: string | null;
  testimonial_quote: string | null;
  testimonial_name: string | null;
  public_visible: boolean;
  bookable: boolean;
  active: boolean;
  sort_order: number;
  availability: CoachAvailability[];
};

export type PrivateSessionRequest = {
  id: number;
  reference_code: string;
  request_type: "private_lesson" | "birthday";
  preferred_coach_id: number | null;
  assigned_coach_id: number | null;
  referred_from_coach_id: number | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  child_name: string;
  child_age: number;
  requested_date: string;
  requested_start_time: string;
  duration_minutes: number;
  location_preference: string;
  session_goal: string;
  notes: string;
  status: "pending" | "accepted" | "declined" | "referred" | "cancelled" | "completed";
  decline_reason: string | null;
  referral_note: string | null;
  parent_notified_at: string | null;
  created_at: string;
  preferred_coach_name: string | null;
  assigned_coach_name: string | null;
};

// No hardcoded placeholder coaches. If the coach_profiles migration hasn't
// run yet, every read function below falls back to this empty list instead
// of fake names — real coaches are entered by staff through the Team page.
const fallbackProfiles: CoachProfile[] = [];

function isMissingTable(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "42P01" || /does not exist/i.test(value?.message ?? "");
}

async function futprepOrganizationId() {
  const db = getSupabaseAdmin();

  const { data: namedOrganizations, error: namedOrganizationError } = await db
    .from("organizations")
    .select("id,name")
    .or("name.ilike.%futprep%,name.ilike.%footprep%")
    .order("id", { ascending: true })
    .limit(1);
  throwIfSupabaseError(namedOrganizationError, "Could not locate Futprep organization");
  if (namedOrganizations?.[0]?.id) return Number(namedOrganizations[0].id);

  const { data: programRows, error: programError } = await db
    .from("programs")
    .select("organization_id,slug")
    .in("slug", ["lil-kickers", "rookies"])
    .not("organization_id", "is", null)
    .limit(1);
  throwIfSupabaseError(programError, "Could not locate Futprep organization from programs");
  if (programRows?.[0]?.organization_id) return Number(programRows[0].organization_id);

  // Recover an existing Futprep application even if an older pilot approval
  // did not create the organization row correctly.
  const { data: applications, error: applicationError } = await db
    .from("applications")
    .select("id,organization_name,contact_person,email,phone,activity_type,main_location,status")
    .or("organization_name.ilike.%futprep%,organization_name.ilike.%footprep%")
    .order("id", { ascending: true })
    .limit(1);
  throwIfSupabaseError(applicationError, "Could not locate Futprep application");

  let application = applications?.[0] ?? null;
  const now = new Date().toISOString();

  // Futprep is the live PortPass pilot. If the database was created before the
  // early-access organization row existed, create the minimum internal pilot
  // record so coach booking is not blocked forever.
  if (!application) {
    const { data: createdApplication, error: createApplicationError } = await db
      .from("applications")
      .insert({
        organization_name: "Futprep Athletics",
        contact_person: "Futprep Team",
        email: "futprep@portpass.local",
        phone: "Not provided",
        activity_type: "Football",
        main_location: "Nassau, The Bahamas",
        player_count: "Pilot",
        help_needed: "PortPass operations",
        description: "System-created Futprep pilot record for the PortPass live pilot.",
        status: "approved",
        submitted_at: now,
        reviewed_at: now,
      })
      .select("id,organization_name,contact_person,email,phone,activity_type,main_location,status")
      .single();
    throwIfSupabaseError(createApplicationError, "Could not create Futprep pilot application");
    if (!createdApplication) throw new Error("Could not create Futprep pilot application");
    application = createdApplication;
  } else if (application.status !== "approved") {
    const { error: approveApplicationError } = await db
      .from("applications")
      .update({ status: "approved", reviewed_at: now })
      .eq("id", application.id);
    throwIfSupabaseError(approveApplicationError, "Could not repair Futprep approval");
    application = { ...application, status: "approved" };
  }

  const { data: existingOrganization, error: existingOrganizationError } = await db
    .from("organizations")
    .select("id")
    .eq("application_id", application.id)
    .maybeSingle();
  throwIfSupabaseError(existingOrganizationError, "Could not check Futprep organization");

  let organizationId = existingOrganization?.id ? Number(existingOrganization.id) : null;

  if (!organizationId) {
    const { data: createdOrganization, error: createOrganizationError } = await db
      .from("organizations")
      .insert({
        application_id: application.id,
        name: application.organization_name,
        primary_contact: application.contact_person,
        email: String(application.email ?? "").toLowerCase(),
        phone: application.phone,
        activity_type: application.activity_type,
        main_location: application.main_location,
        created_at: now,
      })
      .select("id")
      .single();
    throwIfSupabaseError(createOrganizationError, "Could not repair Futprep organization");
    if (!createdOrganization) throw new Error("Could not repair Futprep organization");
    organizationId = Number(createdOrganization.id);
  }

  const { error: attachProgramsError } = await db
    .from("programs")
    .update({ organization_id: organizationId })
    .in("slug", ["lil-kickers", "rookies"])
    .is("organization_id", null);
  throwIfSupabaseError(attachProgramsError, "Could not attach Futprep programs");

  return organizationId;
}

// Confirms the coach_profiles migration has run, without inserting any
// placeholder data. Real coaches are added by staff through the Team page.
async function seedProfiles() {
  const organizationId = await futprepOrganizationId();
  if (!organizationId) return false;
  const db = getSupabaseAdmin();
  const { error } = await db.from("coach_profiles").select("id").eq("organization_id", organizationId).limit(1);
  if (isMissingTable(error)) return false;
  throwIfSupabaseError(error, "Could not check Futprep team schema");
  return true;
}

export async function listPublicCoachProfiles() {
  const ready = await seedProfiles().catch((error) => {
    if (isMissingTable(error)) return false;
    throw error;
  });
  if (!ready) return { schemaReady:false, coaches:fallbackProfiles };

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("coach_profiles")
    .select("*")
    .eq("active", true)
    .eq("public_visible", true)
    .order("sort_order", { ascending:true })
    .order("display_name", { ascending:true });
  throwIfSupabaseError(error, "Could not load Futprep coaches");

  const profiles = (data ?? []) as Omit<CoachProfile,"availability">[];
  const today = new Date().toISOString().slice(0,10);
  const horizon = new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
  const ids = profiles.map((profile)=>profile.id);
  let slots: CoachAvailability[] = [];
  if (ids.length) {
    const { data: availability, error: availabilityError } = await db
      .from("coach_availability")
      .select("*")
      .in("coach_id",ids)
      .gte("availability_date",today)
      .lte("availability_date",horizon)
      .order("availability_date",{ascending:true})
      .order("start_time",{ascending:true});
    throwIfSupabaseError(availabilityError,"Could not load coach availability");
    slots=(availability ?? []) as CoachAvailability[];
  }
  return {
    schemaReady:true,
    coaches:profiles.map((profile)=>({
      ...profile,
      licenses:profile.licenses ?? [],
      played_at:profile.played_at ?? [],
      availability:slots.filter((slot)=>slot.coach_id===profile.id),
    })),
  };
}

export async function listAllCoachProfiles() {
  const ready = await seedProfiles().catch((error) => {
    if (isMissingTable(error)) return false;
    throw error;
  });
  if (!ready) return { schemaReady:false, coaches:fallbackProfiles };

  // Deliberately no .eq("active", true) here: this is the staff-facing
  // management list, and it must keep showing soft-deleted coaches (with
  // active:false) so admins can see what they removed and restore it.
  // listPublicCoachProfiles() is the one that filters to active-only.
  const db=getSupabaseAdmin();
  const {data,error}=await db.from("coach_profiles").select("*").order("active",{ascending:false}).order("sort_order",{ascending:true});
  throwIfSupabaseError(error,"Could not load coach profiles");
  const profiles=(data ?? []) as Omit<CoachProfile,"availability">[];
  const ids=profiles.map((profile)=>profile.id);
  let slots: CoachAvailability[]=[];
  if(ids.length){
    const today=new Date().toISOString().slice(0,10);
    const {data:availability,error:availabilityError}=await db.from("coach_availability").select("*").in("coach_id",ids).gte("availability_date",today).order("availability_date",{ascending:true});
    throwIfSupabaseError(availabilityError,"Could not load availability");
    slots=(availability ?? []) as CoachAvailability[];
  }
  return {schemaReady:true,coaches:profiles.map((profile)=>({...profile,licenses:profile.licenses??[],played_at:profile.played_at??[],availability:slots.filter((slot)=>slot.coach_id===profile.id)}))};
}

export async function createPrivateSessionRequest(input:{
  requestType:"private_lesson"|"birthday";
  preferredCoachId:number|null;
  parentName:string; parentEmail:string; parentPhone:string;
  childName:string; childAge:number;
  requestedDate:string; requestedStartTime:string; durationMinutes:number;
  locationPreference:string; sessionGoal:string; notes:string;
}) {
  const ready=await seedProfiles();
  if(!ready) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  const organizationId=await futprepOrganizationId();
  if(!organizationId) throw new Error("FUTPREP_NOT_FOUND");
  if(input.preferredCoachId){
    const db=getSupabaseAdmin();
    const {data,error}=await db.from("coach_profiles").select("id").eq("id",input.preferredCoachId).eq("organization_id",organizationId).eq("active",true).eq("bookable",true).maybeSingle();
    throwIfSupabaseError(error,"Could not validate preferred coach");
    if(!data) throw new Error("COACH_NOT_AVAILABLE");
  }
  const referenceCode=`FP-PS-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll("-","").slice(0,7).toUpperCase()}`;
  const db=getSupabaseAdmin();
  const {error}=await db.from("private_session_requests").insert({
    reference_code:referenceCode,
    organization_id:organizationId,
    preferred_coach_id:input.preferredCoachId,
    request_type:input.requestType,
    parent_name:input.parentName.trim(),
    parent_email:input.parentEmail.trim().toLowerCase(),
    parent_phone:input.parentPhone.trim(),
    child_name:input.childName.trim(),
    child_age:input.childAge,
    requested_date:input.requestedDate,
    requested_start_time:input.requestedStartTime,
    duration_minutes:input.durationMinutes,
    location_preference:input.locationPreference.trim(),
    session_goal:input.sessionGoal.trim(),
    notes:input.notes.trim(),
    status:"pending",
    updated_at:new Date().toISOString(),
  });
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not request private session");
  return {referenceCode};
}

export async function listPrivateSessionRequests():Promise<{schemaReady:boolean;requests:PrivateSessionRequest[]}>{
  const ready=await seedProfiles().catch((error)=>isMissingTable(error)?false:Promise.reject(error));
  if(!ready) return {schemaReady:false,requests:[]};
  const db=getSupabaseAdmin();
  const [{data:requests,error},{data:profiles,error:profileError}]=await Promise.all([
    db.from("private_session_requests").select("*").order("requested_date",{ascending:true}).order("requested_start_time",{ascending:true}),
    db.from("coach_profiles").select("id,display_name").eq("active",true),
  ]);
  if(isMissingTable(error)) return {schemaReady:false,requests:[]};
  throwIfSupabaseError(error,"Could not load private session requests");
  throwIfSupabaseError(profileError,"Could not load coach names");
  const names=new Map((profiles??[]).map((row:{id:number;display_name:string})=>[Number(row.id),row.display_name]));
  return {schemaReady:true,requests:(requests??[]).map((row:any)=>({...row,preferred_coach_name:row.preferred_coach_id?names.get(Number(row.preferred_coach_id))??null:null,assigned_coach_name:row.assigned_coach_id?names.get(Number(row.assigned_coach_id))??null:null})) as PrivateSessionRequest[]};
}

export async function actOnPrivateSessionRequest(input:{
  id:number; action:"accept"|"decline"|"refer"|"parent_notified"|"complete";
  coachId?:number|null; targetCoachId?:number|null; reason?:string; actor:string;
}){
  const db=getSupabaseAdmin();
  const now=new Date().toISOString();
  const {data:existing,error:loadError}=await db.from("private_session_requests").select("*").eq("id",input.id).maybeSingle();
  if(isMissingTable(loadError)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(loadError,"Could not load private session request");
  if(!existing) throw new Error("REQUEST_NOT_FOUND");

  let patch:Record<string,unknown>={updated_at:now};
  let note="";
  if(input.action==="accept"){
    if(!input.coachId) throw new Error("COACH_REQUIRED");
    patch={...patch,status:"accepted",assigned_coach_id:input.coachId,decline_reason:null};
    note=`Accepted by coach #${input.coachId}`;
  }else if(input.action==="decline"){
    if(!input.reason?.trim()) throw new Error("DECLINE_REASON_REQUIRED");
    patch={...patch,status:"declined",decline_reason:input.reason.trim()};
    note=input.reason.trim();
  }else if(input.action==="refer"){
    if(!input.targetCoachId) throw new Error("COACH_REQUIRED");
    patch={...patch,status:"referred",referred_from_coach_id:existing.assigned_coach_id??input.coachId??null,assigned_coach_id:input.targetCoachId,referral_note:input.reason?.trim()??"",parent_notified_at:null};
    note=input.reason?.trim() || `Referred to coach #${input.targetCoachId}`;
  }else if(input.action==="parent_notified"){
    patch={...patch,parent_notified_at:now};
    note="Parent informed of the change.";
  }else{
    patch={...patch,status:"completed"};
    note="Session marked completed.";
  }

  const {error}=await db.from("private_session_requests").update(patch).eq("id",input.id);
  throwIfSupabaseError(error,"Could not update private session request");
  const {error:eventError}=await db.from("private_session_events").insert({request_id:input.id,actor_account:input.actor,action:input.action,note});
  throwIfSupabaseError(eventError,"Could not record private session action");
}

export async function saveCoachProfile(input:{
  id?:number; displayName:string; slug:string; positionTitle:string; memberType:"coach"|"relations"|"admin";
  bio:string; licenses:string[]; playedAt:string[]; favoritePlayer:string; favoriteTeam:string;
  photoUrl:string; introVideoUrl:string; testimonialQuote:string; testimonialName:string;
  publicVisible:boolean; bookable:boolean; sortOrder:number;
}){
  const ready=await seedProfiles();
  if(!ready) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  const organizationId=await futprepOrganizationId();
  if(!organizationId) throw new Error("FUTPREP_NOT_FOUND");
  const payload={
    organization_id:organizationId,
    slug:input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),
    display_name:input.displayName.trim(),
    position_title:input.positionTitle.trim(),
    member_type:input.memberType,
    bio:input.bio.trim(),
    licenses:input.licenses,
    played_at:input.playedAt,
    favorite_player:input.favoritePlayer.trim()||null,
    favorite_team:input.favoriteTeam.trim()||null,
    photo_url:input.photoUrl.trim()||null,
    intro_video_url:input.introVideoUrl.trim()||null,
    testimonial_quote:input.testimonialQuote.trim()||null,
    testimonial_name:input.testimonialName.trim()||null,
    public_visible:input.publicVisible,
    bookable:input.bookable,
    active:true,
    sort_order:input.sortOrder,
    updated_at:new Date().toISOString(),
  };
  const db=getSupabaseAdmin();
  const query=input.id
    ? db.from("coach_profiles").update(payload).eq("id",input.id)
    : db.from("coach_profiles").insert(payload);
  const {error}=await query;
  throwIfSupabaseError(error,"Could not save coach profile");
}

export async function softDeleteCoach(id:number){
  const db=getSupabaseAdmin();
  const {error}=await db.from("coach_profiles").update({active:false,public_visible:false,bookable:false,updated_at:new Date().toISOString()}).eq("id",id);
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not delete coach");
}

// Restores a soft-deleted profile without also making it public again -
// public_visible/bookable stay off so an admin reviews and re-enables those
// deliberately instead of a restored coach silently reappearing on the site.
export async function restoreCoach(id:number){
  const db=getSupabaseAdmin();
  const {error}=await db.from("coach_profiles").update({active:true,updated_at:new Date().toISOString()}).eq("id",id);
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not restore coach");
}

export async function saveCoachAvailability(input:{
  coachId:number; date:string; startTime:string; endTime:string; status:"available"|"blocked"|"booked"; location:string; note:string; actor:string;
}){
  const db=getSupabaseAdmin();
  const {error}=await db.from("coach_availability").upsert({
    coach_id:input.coachId,
    availability_date:input.date,
    start_time:input.startTime,
    end_time:input.endTime,
    status:input.status,
    location:input.location.trim(),
    note:input.note.trim(),
    created_by:input.actor,
    updated_at:new Date().toISOString(),
  },{onConflict:"coach_id,availability_date,start_time,end_time"});
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not save coach availability");
}
