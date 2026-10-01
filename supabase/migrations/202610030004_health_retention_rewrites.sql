-- Follow-up to 202610030001 (privacy policy v2: children's health details
-- are deleted 90 days after the programme ends).
--
-- The first version skipped any registration already stamped
-- health_purged_at. Health details can be written again after that (a
-- staff correction, a parent finishing a staff-started record late, an
-- import), and those would then never have been deleted. A registration is
-- now due whenever its term has been over for more than 90 days and it
-- still holds any health detail, stamped or not.
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
begin
  with due as (
    select r.id
      from public.registrations r
      join public.program_terms t on t.id = r.term_id
     where t.end_date < p_today - 90
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
           health_purged_at = now()
      from due
     where r.id = due.id
    returning r.id
  ),
  scrubbed as (
    update public.registration_edits e
       set changes = e.changes - array['Allergies', 'Medical conditions', 'Medications', 'Special needs', 'Notes']
      from cleared
     where e.registration_id = cleared.id
    returning e.id
  )
  select count(*) into v_count from cleared;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_health_details(date) from public, anon, authenticated;
