import { FUTPREP_BANK_DETAILS } from "@/app/futprep/config";
import { sendPrivateSessionAcceptedEmail } from "@/lib/email";
import { afterResponse } from "@/lib/afterResponse";
import { defaultPrefix } from "@/lib/paymentRequests/rules";
import { childrenAllowed, privateSessionCode, serviceFromRow, sessionTotalCents, weeklySlotDates, type PrivateService } from "@/lib/privateSessions";
import { awayMessage, cleanWorkingDays, dayOffMessage, isWorkingDay } from "@/lib/workingDays";
import { nassauToday } from "@/lib/futprepTerms";
import type { Attribution } from "@/lib/attribution";
import { channelFromAttribution } from "@/lib/growth";
import { recordPrivatePayLine } from "./coachPay";
import { getPaymentSettings } from "./paymentRequests";
import { futprepOrganizationId } from "./programs";
import { notifyParentOfDecision } from "./privateSessionNotices";
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
  // ISO weekdays the coach takes private sessions on (1 = Monday); empty
  // means any day may be suggested (Brief 29, part C).
  working_days: number[];
  availability: CoachAvailability[];
  // Staff screens only (brief 31, A3): the staff login this profile is tied
  // to, as yes/no facts for the Team page's red chips. Never the PIN or its
  // hash; listPublicCoachProfiles never sets it.
  login?: CoachLoginState;
};

export type CoachLoginState = { linked: boolean; staffName: string | null; role: string | null; hasEmail: boolean; hasPin: boolean; active: boolean };

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
  // Brief 31 (C3, C4): one of Futprep's places, or the parent's own
  // suggestion in location_preference; and whether the coach (who had no
  // working days) will confirm a time.
  location_id?: number | null;
  location_name?: string | null;
  time_to_confirm?: boolean;
};

// No hardcoded placeholder coaches. If the coach_profiles migration hasn't
// run yet, every read function below falls back to this empty list instead
// of fake names — real coaches are entered by staff through the Team page.
// Exactly the columns of CoachProfile. Never "*": since brief 13 the row
// also carries each coach's pay rates and staff login, which only the CEO
// and platform owners may see, and these rows go to the Team page (admin
// too) and the public coaches page.
const COACH_PROFILE_COLUMNS = "id,organization_id,slug,display_name,nickname,position_title,member_type,bio,licenses,played_at,favorite_player,favorite_team,photo_url,intro_video_url,testimonial_quote,testimonial_name,public_visible,bookable,active,sort_order,working_days";

const fallbackProfiles: CoachProfile[] = [];

function isMissingTable(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "42P01" || /does not exist/i.test(value?.message ?? "");
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
    // Brief 31 (C2): the columns a parent's page needs and no others. A
    // blocked day carries only its date: never the note or who blocked it.
    const { data: availability, error: availabilityError } = await db
      .from("coach_availability")
      .select("id,coach_id,availability_date,start_time,end_time,status,location")
      .in("coach_id",ids)
      .gte("availability_date",today)
      .lte("availability_date",horizon)
      .order("availability_date",{ascending:true})
      .order("start_time",{ascending:true});
    throwIfSupabaseError(availabilityError,"Could not load coach availability");
    slots=((availability ?? []) as Omit<CoachAvailability,"note">[]).map((slot)=>({...slot,note:"",location:slot.status==="blocked"?"":slot.location}));
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

// withLogin (brief 31, A3): each coach's staff login facts, for the Team
// page's chips. Only the admin and CEO screens ask for them; the private
// sessions page, which coaches open, never gets them.
export async function listAllCoachProfiles(options: { withLogin?: boolean } = {}) {
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
  const logins=options.withLogin?await coachLoginStates(ids):null;
  return {schemaReady:true,coaches:profiles.map((profile)=>({...profile,licenses:profile.licenses??[],played_at:profile.played_at??[],working_days:profile.working_days??[],availability:slots.filter((slot)=>slot.coach_id===profile.id),...(logins?{login:logins.get(profile.id)??{linked:false,staffName:null,role:null,hasEmail:false,hasPin:false,active:false}}:{})}))};
}

// Each profile's staff login as yes/no facts (brief 31, A3). Whether a PIN
// is set is asked of the database ("pin_hash is not null"), so no hash is
// ever read into the app.
async function coachLoginStates(coachIds:number[]):Promise<Map<number,CoachLoginState>>{
  const out=new Map<number,CoachLoginState>();
  if(!coachIds.length) return out;
  const db=getSupabaseAdmin();
  const {data:links,error:linkError}=await db.from("coach_profiles").select("id,staff_member_id").in("id",coachIds).not("staff_member_id","is",null);
  throwIfSupabaseError(linkError,"Could not load coach logins");
  const staffIds=[...new Set((links??[]).map((row)=>Number(row.staff_member_id)))];
  if(!staffIds.length) return out;
  const [{data:staff,error:staffError},{data:withPin,error:pinError}]=await Promise.all([
    db.from("staff_members").select("id,name,role,email,account_key,active").in("id",staffIds),
    db.from("staff_members").select("id").in("id",staffIds).not("pin_hash","is",null).not("account_key","is",null),
  ]);
  throwIfSupabaseError(staffError,"Could not load coach logins");
  throwIfSupabaseError(pinError,"Could not load coach logins");
  const byId=new Map((staff??[]).map((row):[number,Record<string,unknown>]=>[Number(row.id),row]));
  const pinned=new Set((withPin??[]).map((row)=>Number(row.id)));
  for(const link of links??[]){
    const row=byId.get(Number(link.staff_member_id));
    if(!row) continue;
    out.set(Number(link.id),{linked:true,staffName:(row.name as string)??null,role:(row.role as string)??null,hasEmail:Boolean(row.email),hasPin:pinned.has(Number(row.id)),active:Boolean(row.active)});
  }
  return out;
}

// A priced service a parent can book (brief 06 v2, Part B; Brief 29, part
// B): every Futprep offerings row of type "service", with its length and
// child count from the row (lib/privateSessions.ts serviceFromRow).
// Unpublished rows (placeholder prices) are never offered to parents.
export type { PrivateService } from "@/lib/privateSessions";

export async function listFutprepPrivateServices(options: { publishedOnly?: boolean } = {}): Promise<PrivateService[]> {
  const organizationId = await futprepOrganizationId();
  if (!organizationId) return [];
  const db = getSupabaseAdmin();
  let query = db
    .from("offerings")
    .select("slug,name,summary,price_cents,price_unit,inclusions,is_published,sort_order,duration_minutes,min_children,max_children")
    .eq("organization_id", organizationId)
    .eq("type", "service")
    .order("sort_order", { ascending: true });
  if (options.publishedOnly) query = query.eq("is_published", true);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load Futprep private services");
  return (data ?? []).map((row) => serviceFromRow({
    slug: String(row.slug),
    name: String(row.name),
    summary: (row.summary as string | null) ?? null,
    price_cents: row.price_cents === null ? null : Number(row.price_cents),
    price_unit: (row.price_unit as string | null) ?? null,
    inclusions: (row.inclusions as string[] | null) ?? [],
    is_published: Boolean(row.is_published),
    duration_minutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    min_children: row.min_children === null || row.min_children === undefined ? null : Number(row.min_children),
    max_children: row.max_children === null || row.max_children === undefined ? null : Number(row.max_children),
  }));
}

// "FP-S0007" from the business's payment settings (making the settings row
// with the business's default prefix if it has none); the old random PS-
// code only if the database function is not there yet.
async function nextSessionReference(organizationId: number): Promise<string> {
  const db = getSupabaseAdmin();
  const { data: org } = await db.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const { data, error } = await db.rpc("private_session_next_reference", { p_org: organizationId, p_default_prefix: defaultPrefix(String(org?.name ?? "")) });
  if (error || typeof data !== "string" || !data) {
    if (error) console.error("private session reference", error.message);
    return privateSessionCode();
  }
  return data;
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
  // Brief 29, part D: where the request came from, as a registration records it.
  attribution?:Attribution|null;
  // Brief 31 (C4): one of Futprep's places that takes private sessions;
  // else locationPreference is the parent's own suggestion.
  locationId?:number|null;
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
  if (service && !childrenAllowed(service, childrenCount)) throw new Error(`CHILDREN_OUT_OF_RANGE|${service.minChildren}|${service.maxChildren}`);

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

  let timeToConfirm=false;
  if(preferredCoachId){
    // Only a coach the site shows: a hidden profile's name must not come
    // back through a guessed id.
    const {data,error}=await db.from("coach_profiles").select("id,display_name,working_days").eq("id",preferredCoachId).eq("organization_id",organizationId).eq("active",true).eq("bookable",true).eq("public_visible",true).maybeSingle();
    throwIfSupabaseError(error,"Could not validate preferred coach");
    if(!data) throw new Error("COACH_NOT_AVAILABLE");
    // A suggested time must fall on one of the coach's working days (Brief
    // 29, part C). A posted open time is the coach's own, so it is not checked.
    const days=cleanWorkingDays(data.working_days);
    if(!availabilityId){
      // Brief 31 (C2): a day the coach blocked out is refused first.
      const {data:away,error:awayError}=await db.from("coach_availability").select("id").eq("coach_id",preferredCoachId).eq("availability_date",requestedDate).eq("status","blocked").eq("start_time",DAY_AWAY.start).eq("end_time",DAY_AWAY.end).limit(1);
      throwIfSupabaseError(awayError,"Could not check the coach's days away");
      if((away??[]).length>0) throw new Error(`COACH_AWAY|${awayMessage(String(data.display_name))}`);
      if(!isWorkingDay(days,requestedDate)) throw new Error(`COACH_DAY_OFF|${dayOffMessage(String(data.display_name),days)}`);
    }
    // Brief 31 (C3): a coach with no working days confirms a time; the
    // request is flagged so the desk sees it too.
    timeToConfirm=days.length===0&&!availabilityId;
  }
  let locationId:number|null=null;
  if(input.locationId){
    const {data:place,error:placeError}=await db.from("locations").select("id").eq("id",input.locationId).eq("organization_id",organizationId).eq("active",true).eq("private_sessions_ok",true).maybeSingle();
    throwIfSupabaseError(placeError,"Could not check the place");
    if(!place) throw new Error("LOCATION_NOT_AVAILABLE");
    locationId=Number(place.id);
  }
  const referenceCode=await nextSessionReference(organizationId);
  const {data:created,error}=await db.from("private_session_requests").insert({
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
    location_preference:locationId?"":input.locationPreference.trim(),
    location_id:locationId,
    time_to_confirm:timeToConfirm,
    session_goal:input.sessionGoal.trim(),
    notes:input.notes.trim(),
    service_slug:service?.slug ?? null,
    price_cents:service ? sessionTotalCents(service.priceCents, service.priceUnit, childrenCount) : null,
    children_count:childrenCount,
    availability_id:availabilityId,
    status:"pending",
    source_channel:channelFromAttribution(input.attribution??null),
    utm_source:input.attribution?.utmSource??null,
    utm_medium:input.attribution?.utmMedium??null,
    utm_campaign:input.attribution?.utmCampaign??null,
    referrer_host:input.attribution?.referrerHost??null,
    via_portpass:input.attribution?.viaPortpass??false,
    updated_at:new Date().toISOString(),
  }).select("id").single();
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not request private session");
  const id=Number(created!.id);
  // Every state change is an event (Brief 29, part A), the first one included.
  const {error:eventError}=await db.from("private_session_events").insert({request_id:id,actor_account:"parent",action:"created",note:`Requested ${service?.name ?? input.requestType} for ${requestedDate} ${requestedStartTime}`});
  if(eventError) console.error("private session created event",eventError.message);
  return {referenceCode,id};
}

// Brief 31 (C1): `coachId` limits the list to one coach's requests (where
// they are the preferred or the assigned coach); the inbox page and its
// routes decide who may ask for what (lib/privateSessionAccess.ts).
export async function listPrivateSessionRequests(filter:{coachId?:number}={}):Promise<{schemaReady:boolean;requests:PrivateSessionRequest[]}>{
  const ready=await seedProfiles().catch((error)=>isMissingTable(error)?false:Promise.reject(error));
  if(!ready) return {schemaReady:false,requests:[]};
  const db=getSupabaseAdmin();
  const organizationId=await futprepOrganizationId();
  let requestQuery=db.from("private_session_requests").select("*,locations(name)").order("requested_date",{ascending:true}).order("requested_start_time",{ascending:true});
  if(organizationId) requestQuery=requestQuery.eq("organization_id",organizationId);
  if(filter.coachId) requestQuery=requestQuery.or(`preferred_coach_id.eq.${Number(filter.coachId)},assigned_coach_id.eq.${Number(filter.coachId)}`);
  const [{data:requests,error},{data:profiles,error:profileError},{data:payments,error:paymentsError}]=await Promise.all([
    requestQuery,
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
  return {schemaReady:true,requests:(requests??[]).map(({locations,...row}:any)=>({...row,location_name:(locations as {name?:string}|null)?.name??null,paid_cents:paid.get(Number(row.id))??0,preferred_coach_name:row.preferred_coach_id?names.get(Number(row.preferred_coach_id))??null:null,assigned_coach_name:row.assigned_coach_id?names.get(Number(row.assigned_coach_id))??null:null})) as PrivateSessionRequest[]};
}

// Who a request belongs to, for the routes' check (brief 31, C1). null when
// it isn't Futprep's.
export async function privateSessionOwners(id:number):Promise<{preferred_coach_id:number|null;assigned_coach_id:number|null}|null>{
  const db=getSupabaseAdmin();
  const organizationId=await futprepOrganizationId();
  const {data,error}=await db.from("private_session_requests").select("preferred_coach_id,assigned_coach_id,organization_id").eq("id",id).maybeSingle();
  throwIfSupabaseError(error,"Could not load the request");
  if(!data || (organizationId && Number(data.organization_id)!==organizationId)) return null;
  return {preferred_coach_id:data.preferred_coach_id===null?null:Number(data.preferred_coach_id),assigned_coach_id:data.assigned_coach_id===null?null:Number(data.assigned_coach_id)};
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

// Money received for a private session, against its reference; the
// request's payment status follows what has been received. One database
// call (private_session_record_payment, migration 202610230003) inserts,
// totals and updates with the request locked; the form's key makes a
// double tap or a retry record it once.
export async function recordPrivateSessionPayment(input:{
  requestId:number; amountCents:number; method:"cash"|"bank_transfer"|"online_banking"; reference:string; recordedBy:string; idempotencyKey:string;
}):Promise<{paymentStatus:"unpaid"|"partial"|"paid";paidCents:number}>{
  if(!Number.isInteger(input.amountCents)||input.amountCents<=0) throw new Error("INVALID_AMOUNT");
  const {data,error}=await getSupabaseAdmin().rpc("private_session_record_payment",{p:{request_id:input.requestId,amount_cents:input.amountCents,method:input.method,reference:input.reference,recorded_by:input.recordedBy,idempotency_key:input.idempotencyKey}});
  const code=/PRIVATE_SESSION_PAYMENT_([A-Z_]+)/.exec(error?.message??"")?.[1];
  if(code) throw new Error(code);
  throwIfSupabaseError(error,"Could not record the payment");
  const result=data as {paid_cents:number;payment_status:"unpaid"|"partial"|"paid"};
  return {paymentStatus:result.payment_status,paidCents:Number(result.paid_cents)};
}

// For the growth report (brief 05 Part 2 / 06 Part B): requested,
// accepted, paid, and money received, since a date.
export async function privateSessionStats(sinceIso?:string):Promise<{requested:number;accepted:number;paid:number;revenueCents:number}>{
  const db=getSupabaseAdmin();
  let requestsQuery=db.from("private_session_requests").select("id,status,accepted_at,payment_status,created_at");
  // Futprep's own requests only (brief 31).
  const organizationId=await futprepOrganizationId();
  if(organizationId) requestsQuery=requestsQuery.eq("organization_id",organizationId);
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
  // Brief 31 (C, security review): a completed session is final; its pay
  // line stands.
  if(existing.status==="completed"&&input.action!=="complete"&&input.action!=="parent_notified") throw new Error("COMPLETED");
  if(input.action==="accept"){
    if(!input.coachId) throw new Error("COACH_REQUIRED");
    // Brief 31 (C, review): only an active coach of this business, and not
    // on a day they are away.
    const {data:accepting,error:acceptingError}=await db.from("coach_profiles").select("id").eq("id",input.coachId).eq("organization_id",existing.organization_id).eq("active",true).eq("member_type","coach").maybeSingle();
    throwIfSupabaseError(acceptingError,"Could not check the coach");
    if(!accepting) throw new Error("COACH_NOT_AVAILABLE");
    if(existing.requested_date&&!(existing.status==="accepted"&&Number(existing.assigned_coach_id)===Number(input.coachId))){
      const {data:away,error:awayError}=await db.from("coach_availability").select("id").eq("coach_id",input.coachId).eq("availability_date",existing.requested_date).eq("status","blocked").eq("start_time",DAY_AWAY.start).eq("end_time",DAY_AWAY.end).limit(1);
      throwIfSupabaseError(awayError,"Could not check the coach's days away");
      if((away??[]).length>0) throw new Error("COACH_AWAY");
    }
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
    const {data:target,error:targetError}=await db.from("coach_profiles").select("id").eq("id",input.targetCoachId).eq("organization_id",existing.organization_id).eq("active",true).eq("member_type","coach").maybeSingle();
    throwIfSupabaseError(targetError,"Could not check the coach");
    if(!target) throw new Error("COACH_NOT_AVAILABLE");
    patch={...patch,status:"referred",referred_from_coach_id:existing.assigned_coach_id??input.coachId??null,assigned_coach_id:input.targetCoachId,referral_note:input.reason?.trim()??"",parent_notified_at:null};
    note=input.reason?.trim() || `Referred to coach #${input.targetCoachId}`;
  }else if(input.action==="parent_notified"){
    patch={...patch,parent_notified_at:now};
    note="Parent informed of the change.";
  }else{
    // Brief 31 (C6): only a session that was accepted can be completed.
    if(existing.status!=="accepted" && existing.status!=="completed") throw new Error("NOT_ACCEPTED");
    // A session is completed on its day or after, never before.
    if(String(existing.requested_date)>nassauToday()) throw new Error("NOT_YET");
    patch={...patch,status:"completed"};
    note="Session marked completed.";
  }

  const {error}=await db.from("private_session_requests").update(patch).eq("id",input.id);
  throwIfSupabaseError(error,"Could not update private session request");
  const {error:eventError}=await db.from("private_session_events").insert({request_id:input.id,actor_account:input.actor,action:input.action,note});
  throwIfSupabaseError(eventError,"Could not record private session action");

  // Brief 31 (C6): a completed session is a pay line for its coach, once.
  if(input.action==="complete") await recordPrivatePayLine({requestId:input.id,actor:input.actor});

  // The parent hears about a decline or a referral (Brief 29, part A), once:
  // a second press of the same button, or a referral to the coach already
  // assigned, says nothing again. Sent after the answer; never blocks the
  // action; logged in Messages either way.
  if(input.action==="decline" && existing.status!=="declined"){
    const reason=input.reason!.trim();
    afterResponse(()=>notifyParentOfDecision(input.id,{action:"declined",reason}));
  }else if(input.action==="refer" && Number(existing.assigned_coach_id)!==Number(input.targetCoachId)){
    const {data:target}=await db.from("coach_profiles").select("display_name").eq("id",input.targetCoachId!).eq("organization_id",existing.organization_id).maybeSingle();
    const newCoachName=(target as {display_name?:string}|null)?.display_name ?? "another Futprep coach";
    const note=input.reason?.trim() ?? "";
    afterResponse(()=>notifyParentOfDecision(input.id,{action:"referred",newCoachName,note}));
  }

  // Tell the parent: time, place, price and how to pay with the reference.
  // Bank details come from Futprep's payment settings (the same ones a
  // payment request shows), with the config as the fallback. Never blocks
  // the accept (no email configured, a bad address).
  if(input.action==="accept" && existing.status!=="accepted"){
    try{
      const [{data:coach},{data:slot},{data:place},settings]=await Promise.all([
        db.from("coach_profiles").select("display_name").eq("id",input.coachId!).maybeSingle(),
        existing.availability_id ? db.from("coach_availability").select("location").eq("id",existing.availability_id).maybeSingle() : Promise.resolve({data:null}),
        // Brief 31 (C4): the place the parent picked.
        existing.location_id ? db.from("locations").select("name").eq("id",existing.location_id).eq("organization_id",existing.organization_id).maybeSingle() : Promise.resolve({data:null}),
        getPaymentSettings(Number(existing.organization_id)).catch(()=>null),
      ]);
      const services=existing.service_slug ? await listFutprepPrivateServices() : [];
      const service=services.find((s)=>s.slug===existing.service_slug);
      // The settings row carries the payer line the business wrote; the
      // fallback gives the bank, the account name and the last four only,
      // never the full number.
      const bank=settings && settings.bankName
        ? {bankName:settings.bankName,accountName:settings.accountName,last4:settings.accountNumberLast4,instructions:settings.transferInstructions}
        : {bankName:FUTPREP_BANK_DETAILS.bankName,accountName:FUTPREP_BANK_DETAILS.accountName,last4:FUTPREP_BANK_DETAILS.accountNumber.slice(-4),instructions:null};
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
        location:(slot as {location?:string}|null)?.location || (place as {name?:string}|null)?.name || existing.location_preference || "",
        priceCents:existing.price_cents===null||existing.price_cents===undefined ? null : Number(existing.price_cents),
        referenceCode:existing.reference_code,
        bank,
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

// Brief 29, part C: the days a coach takes private sessions on, from the
// Team page. An empty list clears the rule.
// Brief 31 (C2): a coach's days away, as whole days, from today on.
// A day away is one whole-day blocked row; a single time blocked by hand
// is not. Open times a day away closes carry DAY_AWAY.note, so they open
// again with the day.
export const DAY_AWAY={start:"00:00",end:"23:59",note:"Closed for a day away"} as const;

export function isDayAway(slot:{status:string;start_time:string;end_time:string}):boolean{
  return slot.status==="blocked"&&slot.start_time===DAY_AWAY.start&&slot.end_time===DAY_AWAY.end;
}

export async function listCoachDaysAway(coachId:number):Promise<string[]>{
  const db=getSupabaseAdmin();
  const {data,error}=await db.from("coach_availability").select("availability_date").eq("coach_id",coachId).eq("status","blocked").eq("start_time",DAY_AWAY.start).eq("end_time",DAY_AWAY.end).gte("availability_date",nassauToday()).order("availability_date",{ascending:true});
  if(isMissingTable(error)) return [];
  throwIfSupabaseError(error,"Could not load the days away");
  return [...new Set((data??[]).map((row)=>String(row.availability_date)))];
}

// A whole day away: one blocked row for the day. Any open time that day
// is blocked too, so a parent can't pick it.
export async function setCoachDayAway(input:{coachId:number;date:string;away:boolean;actor:string}):Promise<void>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("INVALID_DATE");
  const db=getSupabaseAdmin();
  const organizationId=await futprepOrganizationId();
  const {data:coach,error:coachError}=await db.from("coach_profiles").select("id").eq("id",input.coachId).eq("organization_id",organizationId).maybeSingle();
  throwIfSupabaseError(coachError,"Could not load the coach");
  if(!coach) throw new Error("COACH_NOT_FOUND");
  const now=new Date().toISOString();
  if(input.away){
    // A session already booked or accepted that day stays the desk's to
    // move: the day away is refused until it is.
    const [{data:booked,error:bookedError},{data:accepted,error:acceptedError}]=await Promise.all([
      db.from("coach_availability").select("id").eq("coach_id",input.coachId).eq("availability_date",input.date).eq("status","booked").limit(1),
      db.from("private_session_requests").select("id").eq("requested_date",input.date).eq("status","accepted").or(`assigned_coach_id.eq.${Number(input.coachId)},and(assigned_coach_id.is.null,preferred_coach_id.eq.${Number(input.coachId)})`).limit(1),
    ]);
    throwIfSupabaseError(bookedError,"Could not check the booked times");
    throwIfSupabaseError(acceptedError,"Could not check the accepted sessions");
    if((booked??[]).length>0||(accepted??[]).length>0) throw new Error("BOOKED_THAT_DAY");
    const {error}=await db.from("coach_availability").upsert({coach_id:input.coachId,availability_date:input.date,start_time:DAY_AWAY.start,end_time:DAY_AWAY.end,status:"blocked",location:"",note:"",created_by:input.actor,updated_at:now},{onConflict:"coach_id,availability_date,start_time,end_time"});
    throwIfSupabaseError(error,"Could not save the day away");
    const {error:slotError}=await db.from("coach_availability").update({status:"blocked",note:DAY_AWAY.note,updated_at:now}).eq("coach_id",input.coachId).eq("availability_date",input.date).eq("status","available");
    throwIfSupabaseError(slotError,"Could not close that day's open times");
  }else{
    const {error}=await db.from("coach_availability").delete().eq("coach_id",input.coachId).eq("availability_date",input.date).eq("status","blocked").eq("start_time",DAY_AWAY.start).eq("end_time",DAY_AWAY.end);
    throwIfSupabaseError(error,"Could not clear the day away");
    // The open times the day away closed open again.
    const {error:slotError}=await db.from("coach_availability").update({status:"available",note:"",updated_at:now}).eq("coach_id",input.coachId).eq("availability_date",input.date).eq("status","blocked").eq("note",DAY_AWAY.note);
    throwIfSupabaseError(slotError,"Could not open that day's times again");
  }
}

export async function setCoachWorkingDays(id:number,days:number[]):Promise<void>{
  const db=getSupabaseAdmin();
  const organizationId=await futprepOrganizationId();
  if(!organizationId) throw new Error("FUTPREP_NOT_FOUND");
  const {data,error}=await db.from("coach_profiles").update({working_days:cleanWorkingDays(days),updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organizationId).select("id");
  if(isMissingTable(error)) throw new Error("PRIVATE_SESSIONS_MIGRATION_REQUIRED");
  throwIfSupabaseError(error,"Could not save the working days");
  if(!data?.length) throw new Error("COACH_NOT_FOUND");
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

// Brief 31 (C2): one coach's own days, for My days: their name, working
// days and days away from today on.
export async function getCoachDays(coachId:number):Promise<{coachId:number;name:string;workingDays:number[];daysAway:string[]}|null>{
  const db=getSupabaseAdmin();
  const organizationId=await futprepOrganizationId();
  const {data,error}=await db.from("coach_profiles").select("id,display_name,working_days").eq("id",coachId).eq("organization_id",organizationId).maybeSingle();
  if(isMissingTable(error)) return null;
  throwIfSupabaseError(error,"Could not load the coach");
  if(!data) return null;
  return {coachId:Number(data.id),name:String(data.display_name),workingDays:cleanWorkingDays(data.working_days),daysAway:await listCoachDaysAway(coachId)};
}
