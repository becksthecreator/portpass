-- Second follow-up to 202610030001 (privacy policy v2: children's health
-- details are deleted 90 days after the programme ends, "together with any
-- earlier versions kept in the record's edit history"). Found by reading
-- the purge against that sentence:
--
-- 1. The edit history was only scrubbed for registrations cleared in the
--    same run. A health detail typed and blanked again on an old record
--    (between two nightly runs) left its value in the history for good.
--    The history is now scrubbed for every registration whose term has been
--    over for more than 90 days, whether or not anything was cleared.
-- 2. The date is a parameter (the tests pass it). A wrong date in the
--    future would have cleared every child's details, running term or not.
--    The function now never uses a date later than today in Nassau.
-- 3. "Medical info was entered by the parent / staff" stayed on the record
--    after the details themselves were gone. It is cleared with them.
--
-- This file is the current definition of the function. 202610030001 holds
-- the nightly schedule (pg_cron, 08:15 UTC); if that file is ever re-run,
-- re-run this one after it.
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
  v_keys text[] := array['Allergies', 'Medical conditions', 'Medications', 'Special needs', 'Notes'];
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
