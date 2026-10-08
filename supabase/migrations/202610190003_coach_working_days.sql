-- Brief 29, part C: the days a coach works. Shown on the coach's card
-- ("Mondays, Wednesdays and Fridays · suggest a time"), used by the booking
-- drawer to accept only those dates when a parent suggests a time, and
-- enforced by the API. 1 = Monday ... 7 = Sunday (ISO). An empty array
-- means "no rule": any day may be suggested, as before.
--
-- Coach Bex (coach_profiles 3, antonio-beckford-jr) works Monday,
-- Wednesday and Friday.

alter table public.coach_profiles
  add column if not exists working_days smallint[] not null default '{}';
alter table public.coach_profiles drop constraint if exists coach_profiles_working_days_check;
alter table public.coach_profiles add constraint coach_profiles_working_days_check
  check (working_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and array_length(working_days, 1) is distinct from 0);
comment on column public.coach_profiles.working_days is 'ISO weekdays the coach takes private sessions on (1 = Monday). Empty: any day may be suggested.';

update public.coach_profiles c
   set working_days = array[1, 3, 5]::smallint[]
  from public.organizations o
 where c.organization_id = o.id and o.slug = 'futprep' and c.slug = 'antonio-beckford-jr';
