import { FUTPREP_BANK_DETAILS } from "@/app/futprep/config";
import { sendPrivateSessionAcceptedEmail } from "@/lib/email";
import { childrenAllowed, isPrivateServiceSlug, perChildCents, PRIVATE_SERVICES, privatePaymentStatus, privateSessionCode, sessionTotalCents, weeklySlotDates, type PrivateServiceSlug } from "@/lib/privateSessions";
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
  // "Coach Bex" -- shown under the name (brief 06 v2, Part B).
  nickname: string | null;
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
  service_slug: string | null;
  price_cents: number | null;
  // Brief 13: a group session is priced per child.
  children_count?: number;
  availability_id: number | null;
  accepted_at: string | null;
  payment_status: "unpaid" | "partial" | "paid" | "waived";
  paid_cents: number;
  preferred_coach_name: string | null;
  assigned_coach_name: string | null;
};

// No hardcoded placeholder coaches. If the coach_profiles migration hasn't
// run yet, every read function below falls back to this empty list instead
// of fake names — real coaches are entered by staff through the Team page.
// Exactly the columns of CoachProfile. Never "*": since brief 13 the row
// also carries each coach's pay rates and staff login, which only the CEO
// and platform owners may see, and these rows go to the Team page (admin
// too) and the public coaches page.
const COACH_PROFILE_COLUMNS = "id,organization_id,slug,display_name,nickname,position_title,member_type,bio,licenses,played_at,favorite_player,favorite_team,photo_url,intro_video_url,testimonial_quote,testimonial_name,public_visible,bookable,active,sort_order";

const fallbackProfiles: CoachProfile[] = [];

function isMissingTable(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "42P01" || /does not exist/i.test(value?.message ?? "");
}

async function futprepOrganizationId() {
  const db = getSupabaseAdmin();

  const { data: bySlug, error: slugError } = await db
    .from("organizations")
    .select("id")
    .eq("slug", "futprep")
    .maybeSingle();
  throwIfSupabaseError(slugError, "Could not locate Futprep organization");
  if (bySlug?.id) return Number(bySlug.id);

  // Fallback chain below for any environment where the slug backfill
  // (supabase/migrations/202609092002_organizations_slug_theme.sql) hasn't
  // run yet, or the organization predates it.
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
    .in("slug", ["lil-kickers", "kickers"])
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
    .in("slug", ["lil-kickers", "kickers"])
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

// How far ahead the public coaches page (and so the "add your weekly slots"
// prompt) looks for open times.
const PUBLIC_SLOT_HORIZON_DAYS = 30;
function slotHorizon(): string {
  return new Date(Date.now()+PUBLIC_SLOT_HORIZON_DAYS*24*60*60*1000).toISOString().slice(0,10);
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
    .select(COACH_PROFILE_COLUMNS)
    .eq("active", true)
    .eq("public_visible", true)
    .order("sort_order", { ascending:true })
    .order("display_name", { ascending:true });
  throwIfSupabaseError(error, "Could not load Futprep coaches");

  const profiles = (data ?? []) as Omit<CoachProfile,"availability">[];
  const today = new Date().toISOString().slice(0,10);
  const horizon = slotHorizon();
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
  const {data,error}=await db.from("coach_profiles").select(COACH_PROFILE_COLUMNS).order("active",{ascending:false}).order("sort_order",{ascending:true});
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

// A priced service a parent can book (brief 06 v2, Part B): the Futprep
// offerings rows whose slugs are in PRIVATE_SERVICES. Unpublished rows
// (placeholder prices) are never offered to parents.
export type PrivateService = {
  slug: PrivateServiceSlug;
  name: string;
  summary: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  inclusions: string[];
  isPublished: boolean;
  requestType: "private_lesson" | "birthday";
  durationMinutes: number;
  kind: "session" | "party";
  // Brief 13: how many children the service is for, and the price per
  // child ($120 for a pair is $60 each; a group is $35 each).
  minChildren: number;
  maxChildren: number;
  perChildCents: number | null;
};

export async function listFutprepPrivateServices(options: { publishedOnly?: boolean } = {}): Promise<PrivateService[]> {
  const organizationId = await futprepOrganizationId();
  if (!organizationId) return [];
  const db = getSupabaseAdmin();
  let query = db
    .from("offerings")
    .select("slug,name,summary,price_cents,price_unit,inclusions,is_published,sort_order")
    .eq("organization_id", organizationId)
    .in("slug", Object.keys(PRIVATE_SERVICES))
    .order("sort_order", { ascending: true });
  if (options.publishedOnly) query = query.eq("is_published", true);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load Futprep private services");
  return (data ?? [])
    .filter((row) => isPrivateServiceSlug(row.slug))
    .map((row) => {
      const meta = PRIVATE_SERVICES[row.slug as PrivateServiceSlug];
      return {
        slug: row.slug as PrivateServiceSlug,
        name: row.name as string,
        summary: (row.summary as string | null) ?? null,
        priceCents: row.price_cents === null ? null : Number(row.price_cents),
        priceUnit: (row.price_unit as string | null) ?? null,
        inclusions: (row.inclusions as string[] | null) ?? [],
        isPublished: Boolean(row.is_published),
        requestType: meta.requestType,
        durationMinutes: meta.durationMinutes,
        kind: meta.kind,
        minChildren: meta.children.min,
        maxChildren: meta.children.max,
        perChildCents: perChildCents(row.slug as PrivateServiceSlug, row.price_cents === null ? null : Number(row.price_cents), (row.price_unit as string | null) ?? null),
      };
    });
}

export async function createPrivateSessionRequest(input:{
  requestType:"private_lesson"|"birthday";
  preferredCoachId:number|null;
  parentName:string; parentEmail:string; parentPhone:string;
  childName:string; childAge:number;
  requestedDate:string; requestedStartTime:string; durationMinutes:number;
  locationPreference:string; sessionGoal:string; notes:string;
  // Brief 06 v2, Part B: the priced service and, optionally, one of the
  // coach's open slots (else the date/time above is a suggestion).
  serviceSlug?:string|null;
  availabilityId?:number|null;
  // Brief 13: children in the session (a group session is 4 to 8).
  childrenCount?:number|null;
}) {
  const ready=await seedProfiles();
  if(!ready) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  const organizationId=await futprepOrganizationId();
  if(!organizationId) throw new Error("FUTPREP_NOT_FOUND");
  const db=getSupabaseAdmin();

  let service: PrivateService | null = null;
  if (input.serviceSlug) {
    service = (await listFutprepPrivateServices({ publishedOnly: true })).find((s) => s.slug === input.serviceSlug) ?? null;
    if (!service) throw new Error("SERVICE_NOT_AVAILABLE");
  }
  const childrenCount = service ? (input.childrenCount ?? service.minChildren) : 1;
  if (service && !childrenAllowed(service.slug, childrenCount)) throw new Error("CHILDREN_OUT_OF_RANGE");

  let preferredCoachId = input.preferredCoachId;
  let requestedDate = input.requestedDate;
  let requestedStartTime = input.requestedStartTime;
  let availabilityId: number | null = null;
  if (input.availabilityId) {
    const { data: slot, error: slotError } = await db
      .from("coach_availability")
      .select("id,coach_id,availability_date,start_time,status")
      .eq("id", input.availabilityId)
      .maybeSingle();
    throwIfSupabaseError(slotError, "Could not load the chosen time");
    if (!slot || slot.status !== "available" || String(slot.availability_date) < new Date().toISOString().slice(0, 10)) throw new Error("SLOT_NOT_AVAILABLE");
    if (preferredCoachId && Number(slot.coach_id) !== preferredCoachId) throw new Error("SLOT_NOT_AVAILABLE");
    preferredCoachId = Number(slot.coach_id);
    requestedDate = String(slot.availability_date);
    requestedStartTime = String(slot.start_time);
    availabilityId = Number(slot.id);
  }

  if(preferredCoachId){
    const {data,error}=await db.from("coach_profiles").select("id").eq("id",preferredCoachId).eq("organization_id",organizationId).eq("active",true).eq("bookable",true).maybeSingle();
    throwIfSupabaseError(error,"Could not validate preferred coach");
    if(!data) throw new Error("COACH_NOT_AVAILABLE");
  }
  const referenceCode=privateSessionCode();
  const {error}=await db.from("private_session_requests").insert({
    reference_code:referenceCode,
    organization_id:organizationId,
    preferred_coach_id:preferredCoachId,
    request_type:service?.requestType ?? input.requestType,
    parent_name:input.parentName.trim(),
    parent_email:input.parentEmail.trim().toLowerCase(),
    parent_phone:input.parentPhone.trim(),
    child_name:input.childName.trim(),
    child_age:input.childAge,
    requested_date:requestedDate,
    requested_start_time:requestedStartTime,
    duration_minutes:service?.durationMinutes ?? input.durationMinutes,
    location_preference:input.locationPreference.trim(),
    session_goal:input.sessionGoal.trim(),
    notes:input.notes.trim(),
    service_slug:service?.slug ?? null,
    price_cents:service ? sessionTotalCents(service.priceCents, service.priceUnit, childrenCount) : null,
    children_count:childrenCount,
    availability_id:availabilityId,
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
  const [{data:requests,error},{data:profiles,error:profileError},{data:payments,error:paymentsError}]=await Promise.all([
    db.from("private_session_requests").select("*").order("requested_date",{ascending:true}).order("requested_start_time",{ascending:true}),
    db.from("coach_profiles").select("id,display_name").eq("active",true),
    db.from("payments").select("private_session_request_id,amount_cents").not("private_session_request_id","is",null).eq("status","received"),
  ]);
  if(isMissingTable(error)) return {schemaReady:false,requests:[]};
  throwIfSupabaseError(error,"Could not load private session requests");
  throwIfSupabaseError(profileError,"Could not load coach names");
  throwIfSupabaseError(paymentsError,"Could not load private session payments");
  const names=new Map((profiles??[]).map((row:{id:number;display_name:string})=>[Number(row.id),row.display_name]));
  const paid=new Map<number,number>();
  for(const p of (payments??[]) as Array<{private_session_request_id:number;amount_cents:number}>) paid.set(Number(p.private_session_request_id),(paid.get(Number(p.private_session_request_id))??0)+Number(p.amount_cents));
  return {schemaReady:true,requests:(requests??[]).map((row:Omit<PrivateSessionRequest,"paid_cents"|"preferred_coach_name"|"assigned_coach_name">)=>({...row,paid_cents:paid.get(Number(row.id))??0,preferred_coach_name:row.preferred_coach_id?names.get(Number(row.preferred_coach_id))??null:null,assigned_coach_name:row.assigned_coach_id?names.get(Number(row.assigned_coach_id))??null:null})) as PrivateSessionRequest[]};
}

// Coach side (brief 06 v2, Part B): "every Wednesday, 4-4:45 pm, for 6
// weeks" becomes six open slots. Existing identical slots are left alone.
export async function addWeeklyCoachSlots(input:{
  coachId:number; dayOfWeek:string; startTime:string; endTime:string; weeks:number; location:string; actor:string; fromDate?:string;
}):Promise<number>{
  const dates=weeklySlotDates({fromDate:input.fromDate ?? new Date().toISOString().slice(0,10),dayOfWeek:input.dayOfWeek,weeks:input.weeks});
  if(!dates.length) throw new Error("INVALID_DAY");
  const db=getSupabaseAdmin();
  const {data:coach,error:coachError}=await db.from("coach_profiles").select("id").eq("id",input.coachId).eq("active",true).maybeSingle();
  throwIfSupabaseError(coachError,"Could not load coach");
  if(!coach) throw new Error("COACH_NOT_FOUND");
  const now=new Date().toISOString();
  const {data,error}=await db.from("coach_availability").upsert(
    dates.map((date)=>({coach_id:input.coachId,availability_date:date,start_time:input.startTime.trim(),end_time:input.endTime.trim(),status:"available",location:input.location.trim(),note:"",created_by:input.actor,updated_at:now})),
    {onConflict:"coach_id,availability_date,start_time,end_time",ignoreDuplicates:true},
  ).select("id");
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not add coach slots");
  return (data??[]).length;
}

// Money received for a private session, against its PS- code; the
// request's payment status follows what has been received.
export async function recordPrivateSessionPayment(input:{
  requestId:number; amountCents:number; method:"cash"|"bank_transfer"|"online_banking"; reference:string; recordedBy:string;
}):Promise<{paymentStatus:"unpaid"|"partial"|"paid";paidCents:number}>{
  if(!Number.isInteger(input.amountCents)||input.amountCents<=0) throw new Error("INVALID_AMOUNT");
  const db=getSupabaseAdmin();
  const {data:request,error:loadError}=await db.from("private_session_requests").select("id,price_cents,status").eq("id",input.requestId).maybeSingle();
  throwIfSupabaseError(loadError,"Could not load private session");
  if(!request) throw new Error("REQUEST_NOT_FOUND");
  const now=new Date().toISOString();
  const {error}=await db.from("payments").insert({private_session_request_id:input.requestId,amount_cents:input.amountCents,method:input.method,reference:input.reference.trim()||null,recorded_by:input.recordedBy,received_at:now,status:"received",note:"Private session"});
  throwIfSupabaseError(error,"Could not record the payment");
  const {data:rows,error:sumError}=await db.from("payments").select("amount_cents").eq("private_session_request_id",input.requestId).eq("status","received");
  throwIfSupabaseError(sumError,"Could not total the payments");
  const paidCents=(rows??[]).reduce((sum,row)=>sum+Number(row.amount_cents),0);
  const paymentStatus=privatePaymentStatus(request.price_cents===null?null:Number(request.price_cents),paidCents);
  const {error:updateError}=await db.from("private_session_requests").update({payment_status:paymentStatus,updated_at:now}).eq("id",input.requestId);
  throwIfSupabaseError(updateError,"Could not update the payment status");
  await db.from("private_session_events").insert({request_id:input.requestId,actor_account:input.recordedBy,action:"payment",note:`Recorded ${input.amountCents} cents (${input.method})`});
  return {paymentStatus,paidCents};
}

// For the growth report (brief 05 Part 2 / 06 Part B): requested,
// accepted, paid, and money received, since a date.
export async function privateSessionStats(sinceIso?:string):Promise<{requested:number;accepted:number;paid:number;revenueCents:number}>{
  const db=getSupabaseAdmin();
  let requestsQuery=db.from("private_session_requests").select("id,status,accepted_at,payment_status,created_at");
  if(sinceIso) requestsQuery=requestsQuery.gte("created_at",sinceIso);
  const {data:requests,error}=await requestsQuery;
  if(isMissingTable(error)) return {requested:0,accepted:0,paid:0,revenueCents:0};
  throwIfSupabaseError(error,"Could not count private sessions");
  const ids=(requests??[]).map((r)=>Number(r.id));
  let revenueCents=0;
  if(ids.length){
    const {data:payments,error:paymentsError}=await db.from("payments").select("amount_cents").in("private_session_request_id",ids).eq("status","received");
    throwIfSupabaseError(paymentsError,"Could not total private session payments");
    revenueCents=(payments??[]).reduce((sum,p)=>sum+Number(p.amount_cents),0);
  }
  const rows=(requests??[]) as Array<{status:string;accepted_at:string|null;payment_status:string}>;
  return {
    requested:rows.length,
    accepted:rows.filter((r)=>r.accepted_at!==null||r.status==="accepted"||r.status==="completed").length,
    paid:rows.filter((r)=>r.payment_status==="paid").length,
    revenueCents,
  };
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
    // The parent picked one of a coach's open slots: accepting books it,
    // and only if it is still open (brief 06 v2, Part B).
    if(existing.availability_id){
      const {data:booked,error:slotError}=await db.from("coach_availability").update({status:"booked",updated_at:now}).eq("id",existing.availability_id).eq("status","available").select("id");
      throwIfSupabaseError(slotError,"Could not book the chosen time");
      if(!booked?.length && existing.status!=="accepted") throw new Error("SLOT_TAKEN");
    }
    patch={...patch,status:"accepted",assigned_coach_id:input.coachId,decline_reason:null,accepted_at:existing.accepted_at??now};
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

  // Tell the parent: time, place, price and how to pay with the PS- code.
  // Never blocks the accept (no email configured, a bad address).
  if(input.action==="accept" && existing.status!=="accepted"){
    try{
      const [{data:coach},{data:slot}]=await Promise.all([
        db.from("coach_profiles").select("display_name").eq("id",input.coachId!).maybeSingle(),
        existing.availability_id ? db.from("coach_availability").select("location").eq("id",existing.availability_id).maybeSingle() : Promise.resolve({data:null}),
      ]);
      const services=existing.service_slug ? await listFutprepPrivateServices() : [];
      const service=services.find((s)=>s.slug===existing.service_slug);
      await sendPrivateSessionAcceptedEmail({
        organizationId:existing.organization_id===null||existing.organization_id===undefined ? null : Number(existing.organization_id),
        parentEmail:existing.parent_email,
        parentName:existing.parent_name,
        childName:String(existing.child_name).split(" ")[0] ?? existing.child_name,
        serviceName:service?.name ?? (existing.request_type==="birthday" ? "birthday session" : "private session"),
        coachName:coach?.display_name ?? "Your Futprep coach",
        date:existing.requested_date,
        startTime:existing.requested_start_time,
        durationMinutes:Number(existing.duration_minutes),
        location:(slot as {location?:string}|null)?.location || existing.location_preference || "",
        priceCents:existing.price_cents===null||existing.price_cents===undefined ? null : Number(existing.price_cents),
        referenceCode:existing.reference_code,
        bank:FUTPREP_BANK_DETAILS,
      });
    }catch(emailError){
      console.error("private session accepted email failed", emailError);
    }
  }
}

export async function saveCoachProfile(input:{
  id?:number; displayName:string; slug:string; positionTitle:string; memberType:"coach"|"relations"|"admin";
  bio:string; licenses:string[]; playedAt:string[]; favoritePlayer:string; favoriteTeam:string;
  // Omitted on an update = leave the photo alone. The Hide and Pause
  // buttons re-send the whole row from the page's state, which can be older
  // than a photo just uploaded through the photo route (brief 16, C2).
  photoUrl?:string; introVideoUrl:string; testimonialQuote:string; testimonialName:string;
  publicVisible:boolean; bookable:boolean; sortOrder:number;
}){
  const ready=await seedProfiles();
  if(!ready) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  const organizationId=await futprepOrganizationId();
  if(!organizationId) throw new Error("FUTPREP_NOT_FOUND");
  const payload:Record<string,unknown>={
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
    intro_video_url:input.introVideoUrl.trim()||null,
    testimonial_quote:input.testimonialQuote.trim()||null,
    testimonial_name:input.testimonialName.trim()||null,
    public_visible:input.publicVisible,
    bookable:input.bookable,
    active:true,
    sort_order:input.sortOrder,
    updated_at:new Date().toISOString(),
  };
  if(input.photoUrl!==undefined) payload.photo_url=input.photoUrl.trim()||null;
  else if(!input.id) payload.photo_url=null;
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

// Brief 16, C1: the prompt a coach sees on their own card and dashboard
// while their schedule is empty. The coach is the profile tied to this
// staff login on the Coach pay page (coach_profiles.staff_member_id); null
// when the login isn't linked to an active, bookable coach, so a parent or
// an unlinked helper never sees the prompt.
export async function coachSlotPrompt(staffMemberId:number):Promise<{coachId:number;needsSlots:boolean}|null>{
  const db=getSupabaseAdmin();
  const {data:coach,error}=await db.from("coach_profiles").select("id").eq("staff_member_id",staffMemberId).eq("active",true).eq("bookable",true).maybeSingle();
  if(isMissingTable(error)) return null;
  throwIfSupabaseError(error,"Could not load the coach for this login");
  if(!coach) return null;
  const today=new Date().toISOString().slice(0,10);
  const {count,error:slotError}=await db.from("coach_availability").select("id",{count:"exact",head:true}).eq("coach_id",coach.id).eq("status","available").gte("availability_date",today).lte("availability_date",slotHorizon());
  throwIfSupabaseError(slotError,"Could not count the coach's open times");
  return {coachId:Number(coach.id),needsSlots:(count??0)===0};
}

// Brief 16, C2: the square photo uploaded from the Team page (or null to
// remove it). Returns the URL it replaced so the route can delete the old
// file from storage when that file was ours.
export async function setCoachPhoto(coachId:number,photoUrl:string|null):Promise<{previousUrl:string|null}>{
  const db=getSupabaseAdmin();
  const {data:coach,error}=await db.from("coach_profiles").select("id,photo_url").eq("id",coachId).maybeSingle();
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not load the coach");
  if(!coach) throw new Error("COACH_NOT_FOUND");
  const {error:updateError}=await db.from("coach_profiles").update({photo_url:photoUrl,updated_at:new Date().toISOString()}).eq("id",coachId);
  throwIfSupabaseError(updateError,"Could not save the coach photo");
  return {previousUrl:(coach.photo_url as string|null)??null};
}
