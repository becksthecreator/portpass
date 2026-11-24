-- Rule 3 (Security & QA audit, 19 Nov 2026): the 90-day purge also clears
-- a child's emergency contact and who may collect them.
--
-- CLAUDE.md rule 3 covers "health, allergy, medication and emergency
-- details": purged 90 days after the programme ends. The purge
-- (202610030006) cleared the health fields and their edit history only;
-- emergency_contact_name, emergency_contact_phone and authorized_pickup
-- stayed on the registration, and in registration_edits, for good.
--
-- This file is now the current definition of the function, replacing
-- 202610030006's. Same rules as before: never a date later than today in
-- Nassau, null (never asked) stays null, idempotent, and the edit history
-- is scrubbed for every registration whose term ended more than 90 days
-- ago. Registrations already purged before this migration are picked up
-- on the next nightly run, because their emergency fields are not blank.
-- The nightly wrapper (202610180002) and its schedule are unchanged.
-- Numbered 202610280009, after #279's 0008.

create or replace function public.purge_expired_health_details(
  p_today date default (now() at time zone 'America/Nassau')::date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_today date := least(p_today, (now() at time zone 'America/Nassau')::date);
  -- The labels registration_edits records (db/staff.ts AUDIT_FIELD_LABELS).
  v_keys text[] := array[
    'Allergies', 'Medical conditions', 'Medications', 'Special needs', 'Notes',
    'Emergency contact name', 'Emergency contact phone', 'Authorized pickup'
  ];
begin
  with due as (
    select r.id
      from public.registrations r
      join public.program_terms t on t.id = r.term_id
     where t.end_date < v_today - 90
       and (
         r.health_purged_at is null
         or coalesce(r.allergies, '') <> ''
         or coalesce(r.medical_conditions, '') <> ''
         or coalesce(r.medications, '') <> ''
         or coalesce(r.special_needs, '') <> ''
         or coalesce(r.additional_notes, '') <> ''
         or coalesce(r.emergency_contact_name, '') <> ''
         or coalesce(r.emergency_contact_phone, '') <> ''
         or coalesce(r.authorized_pickup, '') <> ''
       )
  ),
  cleared as (
    update public.registrations r
       -- null means "never asked" (a staff-started registration); keep that
       -- distinction, and blank whatever was actually given.
       set allergies = case when r.allergies is null then null else '' end,
           medical_conditions = case when r.medical_conditions is null then null else '' end,
           medications = case when r.medications is null then null else '' end,
           special_needs = case when r.special_needs is null then null else '' end,
           additional_notes = '',
           medical_info_source = null,
           emergency_contact_name = case when r.emergency_contact_name is null then null else '' end,
           emergency_contact_phone = case when r.emergency_contact_phone is null then null else '' end,
           authorized_pickup = case when r.authorized_pickup is null then null else '' end,
           health_purged_at = now()
      from due
     where r.id = due.id
    returning r.id
  )
  select count(*) into v_count from cleared;

  update public.registration_edits e
     set changes = e.changes - v_keys
    from public.registrations r
    join public.program_terms t on t.id = r.term_id
   where e.registration_id = r.id
     and t.end_date < v_today - 90
     and e.changes ?| v_keys;

  return v_count;
end;
$$;

revoke all on function public.purge_expired_health_details(date) from public, anon, authenticated;
