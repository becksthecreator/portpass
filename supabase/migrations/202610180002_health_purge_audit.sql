-- Brief 21, part E (3): the nightly purge of children's health details
-- writes to audit_log. The purge itself is purge_expired_health_details
-- (202610030001, current definition 202610030006): 90 days after a
-- programme's term ends, the health fields and their edit history go. It
-- has run nightly at 08:15 UTC through pg_cron since October 3rd and left
-- no record of having run, so nobody could show an auditor that it did.
--
-- This wrapper runs the purge and writes one audit_log row per night:
-- how many registrations were cleared, and the rule. No child's name, no
-- registration id, no value: the row says the job ran and what it did, not
-- to whom. The schedule now calls the wrapper.

create or replace function public.purge_expired_health_details_nightly()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  v_count := public.purge_expired_health_details();
  insert into public.audit_log (actor_user_id, organization_id, action, target_table, target_id, before, after)
  values (
    null, null, 'registrations.health_purged', 'registrations', null, null,
    jsonb_build_object('cleared', v_count, 'rule', 'health details removed 90 days after the programme ended', 'job', 'purge-expired-health-details')
  );
  return v_count;
end;
$$;

revoke all on function public.purge_expired_health_details_nightly() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-health-details';
    perform cron.schedule(
      'purge-expired-health-details',
      '15 8 * * *',
      'select public.purge_expired_health_details_nightly()'
    );
  else
    raise notice 'pg_cron is not installed here: purge_expired_health_details_nightly() is not scheduled.';
  end if;
end $$;
