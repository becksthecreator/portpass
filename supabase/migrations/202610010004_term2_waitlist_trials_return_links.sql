-- Futprep brief 06 v2, Part C (30 Sept): the Term 2 launch -- early access
-- for returning families, a waitlist, and "first Saturday free with a
-- PortPass account" trials. Term 1 is untouched.

-- Two new registration states. Neither takes a term spot (capacity counts
-- pending_details / pending / confirmed only) and neither makes a family
-- "returning" for the growth rules.
alter table public.registrations drop constraint if exists registrations_registration_status_check;
alter table public.registrations add constraint registrations_registration_status_check
  check (registration_status in ('pending_details','pending','confirmed','cancelled','waitlist','trial'));

-- The Saturday a trial is for (the roster shows the child only that day).
alter table public.registrations
  add column if not exists trial_session_id bigint references public.sessions(id) on delete set null,
  -- The trial a "join the rest of the term" registration came from.
  add column if not exists joined_from_registration_id bigint references public.registrations(id) on delete set null;

-- Trials: which Saturdays, and how many trial children per class per day.
alter table public.program_terms
  add column if not exists trial_dates date[] not null default '{}',
  add column if not exists trial_spots_per_session integer not null default 3 check (trial_spots_per_session >= 0);

-- Per-family early-access links (/futprep/register/return/<token>). Only a
-- hash of the token is stored; the link itself is shown once to staff.
-- Valid while an active term's early_access_until is in the future.
create table if not exists public.futprep_return_links (
  id                     bigint generated always as identity primary key,
  token_hash             text not null unique,
  source_registration_id bigint not null references public.registrations(id) on delete cascade,
  created_by             text,
  created_at             timestamptz not null default now(),
  last_used_at           timestamptz,
  used_registration_id   bigint references public.registrations(id) on delete set null
);
alter table public.futprep_return_links enable row level security;
revoke all on public.futprep_return_links from anon, authenticated;
create index if not exists futprep_return_links_source_idx on public.futprep_return_links (source_registration_id);

-- Sessions follow a term's dates for classes too, not only camps: a class
-- meets weekly on its day_of_week; a camp every weekday. On insert or a
-- date change the missing days are added, and days that are no longer in
-- the schedule are removed -- unless attendance was already taken on them.
create or replace function public.generate_camp_sessions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  prog record;
  weekday int;
begin
  select id, program_type, start_time, location, day_of_week
    into prog
    from public.programs
   where id = new.program_id;
  if prog.id is null then
    return new;
  end if;
  weekday := array_position(array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], prog.day_of_week) - 1;
  if prog.program_type is distinct from 'camp' and weekday is null then
    return new;
  end if;

  with wanted as (
    select d::date as day
      from generate_series(new.start_date::timestamp, new.end_date::timestamp, interval '1 day') as d
     where not (d::date = any(coalesce(new.break_dates, '{}'::date[])))
       and case when prog.program_type = 'camp'
                then extract(isodow from d) between 1 and 5
                else extract(dow from d) = weekday end
  )
  insert into public.sessions (program_id, term_id, session_date, start_time, location, status)
  select new.program_id, new.id, w.day,
         coalesce(nullif(new.daily_start_time, ''), prog.start_time), prog.location, 'scheduled'
    from wanted w
  on conflict (program_id, term_id, session_date) do nothing;

  if tg_op = 'UPDATE' then
    delete from public.sessions s
     where s.term_id = new.id
       and (s.session_date < new.start_date
            or s.session_date > new.end_date
            or s.session_date = any(coalesce(new.break_dates, '{}'::date[])))
       and not exists (select 1 from public.attendance a where a.session_id = s.id)
       and not exists (select 1 from public.registrations r where r.trial_session_id = s.id);
  end if;

  return new;
end;
$$;

revoke all on function public.generate_camp_sessions() from public, anon, authenticated;

-- Term 2 on both Saturday classes: Sat 9 Jan - Sat 20 Mar 2027. CREATED
-- SWITCHED OFF. Fees, break dates and the public opening are PLACEHOLDERS
-- (Term 1's fees are copied) until Antonio confirms; trials on Sat 9 and
-- Sat 16 Jan; returning-family early access until Wed 18 Nov, 11:59 pm
-- Nassau (EST = 04:59 UTC on 19 Nov). Switch on per class with:
--   update public.program_terms set active = true, notes = null,
--          weekly_fee_cents = ?, term_fee_cents = ?, break_dates = '{...}',
--          registration_opens_at = '2026-11-19T05:00:00Z'
--    where name = 'Term 2' and program_id = (select id from public.programs where slug = '<lil-kickers|kickers>');
insert into public.program_terms (program_id, name, start_date, end_date, break_dates, weekly_fee_cents, term_fee_cents, registration_fee_cents,
                                  registration_opens_at, early_access_until, trial_dates, trial_spots_per_session, notes, active)
select p.id, 'Term 2', '2027-01-09', '2027-03-20', '{}', t1.weekly_fee_cents, t1.term_fee_cents, 0,
       '2026-11-19T05:00:00Z', '2026-11-19T04:59:00Z', '{2027-01-09,2027-01-16}', 3,
       'PLACEHOLDER: fees, break dates and opening date await Antonio. Do not activate until confirmed.',
       false
  from public.programs p
  join public.program_terms t1 on t1.program_id = p.id and t1.name = 'Term 1'
 where p.slug in ('lil-kickers','kickers')
on conflict (program_id, name) do nothing;
