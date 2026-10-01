-- Privacy Policy v2 (brief 16 D, brief 07): "A child's health details are
-- deleted 90 days after the programme ends." Antonio approved the period.
-- Until now nothing deleted anything, so the policy could not be true.
--
-- What is removed, per registration, once its term ended more than 90 days
-- ago: allergies, medical conditions, medications, special needs and the
-- free-text notes box (parents put health information there too), plus
-- the old and new values of those fields in the staff edit history. The
-- rest of the registration (names, contact, attendance, payments) is the
-- business's record and is kept. Nothing else is touched.
--
-- health_purged_at marks the row, so the job is idempotent and the staff
-- detail page can say the details were removed rather than "none given".

alter table public.registrations
  add column if not exists health_purged_at timestamptz;

comment on column public.registrations.health_purged_at is
  'When the health details were deleted under the 90-day retention rule (privacy policy v2). Null = not purged.';

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
     where r.health_purged_at is null
       and t.end_date < p_today - 90
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

comment on function public.purge_expired_health_details(date) is
  'Deletes children''s health details 90 days after their programme ended (privacy policy v2). Returns how many registrations were cleared. Run daily by pg_cron job purge-expired-health-details.';

-- Run it every day at 08:15 UTC (early morning in Nassau). Guarded so a
-- database without pg_cron (or without the right to enable it) still
-- applies this migration; the function can then be scheduled another way.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-health-details';
    perform cron.schedule(
      'purge-expired-health-details',
      '15 8 * * *',
      'select public.purge_expired_health_details()'
    );
  else
    raise notice 'pg_cron is not available here: purge_expired_health_details() is not scheduled.';
  end if;
exception when others then
  raise notice 'Could not schedule the health-details purge (%). The function exists; schedule it another way.', sqlerrm;
end;
$$;
