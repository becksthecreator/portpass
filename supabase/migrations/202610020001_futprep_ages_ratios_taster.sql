-- Brief 12 (30 Sept): Futprep ages in months, class caps from coaches on
-- duty, the free taster moved to a pre-term Saturday, the camp format as
-- data, and a location note. Term 1 fees and registrations are untouched.
-- Re-runnable.

-- ---- 1. Ages in months ------------------------------------------------------
-- Lil Kickers is 1½–3 and Kickers 3–6; whole-year columns can't say 1½.
-- When set, the month columns win over age_min / age_max.
alter table public.programs
  add column if not exists age_min_months integer check (age_min_months is null or age_min_months >= 0),
  add column if not exists age_max_months integer check (age_max_months is null or age_max_months >= 0);

alter table public.programs drop constraint if exists programs_age_months_order;
alter table public.programs add constraint programs_age_months_order
  check (age_min_months is null or age_max_months is null or age_min_months <= age_max_months);

update public.programs set age_min_months = 18, age_max_months = 47 where slug = 'lil-kickers';
update public.programs set age_min_months = 36, age_max_months = 83 where slug = 'kickers';

-- The Futprep page's program cards read ages from offerings. Integers can't
-- say "1½" either, so a label wins when set.
alter table public.offerings add column if not exists age_label text;
update public.offerings f set age_label = '1½–3'
  from public.organizations o
 where f.organization_id = o.id and o.slug = 'futprep' and f.slug = 'lil-kickers';
update public.offerings f set age_label = '3–6'
  from public.organizations o
 where f.organization_id = o.id and o.slug = 'futprep' and f.slug = 'kickers';

-- ---- 2. Class caps from coaches on duty ------------------------------------
-- Effective cap of a session = min(capacity, coaches on duty × children per
-- coach). sessions.coaches_on_duty null means "the program's default".
alter table public.programs
  add column if not exists children_per_coach integer check (children_per_coach is null or children_per_coach > 0),
  add column if not exists default_coaches integer not null default 1 check (default_coaches >= 0);
alter table public.sessions
  add column if not exists coaches_on_duty integer check (coaches_on_duty is null or coaches_on_duty between 0 and 20);

update public.programs set children_per_coach = 6 where slug = 'lil-kickers';
update public.programs set children_per_coach = 8 where slug = 'kickers';
update public.programs p set children_per_coach = 10
  from public.organizations o
 where p.organization_id = o.id and o.slug = 'futprep' and p.program_type = 'camp' and p.children_per_coach is null;

-- Term 1 already has 7 Lil Kickers and 11 Kickers. With one coach the caps
-- would be 6 and 8, and new families would go to the waitlist mid-term, so
-- both classes start at two coaches (caps 12 and 16; capacity stays 20).
-- Staff change a single Saturday with the "Coaches today" stepper; the
-- default is one line:
--   update public.programs set default_coaches = ? where slug = '<lil-kickers|kickers>';
update public.programs set default_coaches = 2
 where slug in ('lil-kickers', 'kickers') and default_coaches = 1;

-- ---- 5. Location note ------------------------------------------------------
-- Which field the 9:00 class uses is still to be confirmed; the location
-- text stays as it is and this note carries the detail when there is one.
alter table public.programs add column if not exists location_note text;

-- ---- 3. The free taster: one pre-term Saturday ------------------------------
-- Replaces the two in-term free Saturdays from #97. Sat 12 Dec 2026, with a
-- backup of Sat 2 Jan 2027, which is a one-line change:
--   update public.program_terms set taster_date = '2027-01-02'
--    where name = 'Term 2' and program_id in (select id from public.programs where slug in ('lil-kickers','kickers'));
alter table public.program_terms add column if not exists taster_date date;

-- The session trigger also creates the taster Saturday (which falls before
-- the term starts) and keeps it when the term's dates change.
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

  if prog.program_type = 'camp' or weekday is not null then
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
  end if;

  if new.taster_date is not null then
    insert into public.sessions (program_id, term_id, session_date, start_time, location, status)
    values (new.program_id, new.id, new.taster_date,
            coalesce(nullif(new.daily_start_time, ''), prog.start_time), prog.location, 'scheduled')
    on conflict (program_id, term_id, session_date) do nothing;
  end if;

  -- A weekly class with no weekday (or anything else unscheduled) keeps
  -- its sessions exactly as they are, as before.
  if tg_op = 'UPDATE' and (prog.program_type = 'camp' or weekday is not null) then
    delete from public.sessions s
     where s.term_id = new.id
       and (s.session_date < new.start_date
            or s.session_date > new.end_date
            or s.session_date = any(coalesce(new.break_dates, '{}'::date[])))
       and s.session_date is distinct from new.taster_date
       and not exists (select 1 from public.attendance a where a.session_id = s.id)
       and not exists (select 1 from public.registrations r where r.trial_session_id = s.id);
  end if;

  return new;
end;
$$;

revoke all on function public.generate_camp_sessions() from public, anon, authenticated;

drop trigger if exists program_terms_camp_sessions on public.program_terms;
create trigger program_terms_camp_sessions
  after insert or update of start_date, end_date, break_dates, daily_start_time, taster_date
  on public.program_terms
  for each row execute function public.generate_camp_sessions();

-- Term 2 on both Saturday classes: the taster on 12 Dec, no in-term free
-- Saturdays. The trigger adds the 12 Dec session; the old 9 and 16 Jan
-- trial dates stay ordinary term Saturdays.
update public.program_terms t
   set taster_date = '2026-12-12', trial_dates = '{}'
  from public.programs p
 where t.program_id = p.id
   and p.slug in ('lil-kickers', 'kickers')
   and t.name = 'Term 2'
   and t.taster_date is null;

-- ---- 4. Camp format (data) -------------------------------------------------
-- Christmas 2025 was 2 days, 9:00–12:00, drop-off from 8:30, LCIS Lower
-- Campus, ages 6–15, $100. On production both 2026 camps were already set
-- to these values and switched on by Futprep on 30 Sept; the statements
-- below only bring an older copy of the database to the same shape. They
-- never change `active` on an existing row, and a new row starts off.

-- October camp: moves the original draft (Tue 13 – Fri 16 Oct) to
-- Thu 15 – Fri 16 Oct. No-op once it has been moved.
update public.programs
   set name = 'October Futsal & Ball Mastery Camp', age_min = 6, age_max = 15, capacity = 40,
       location = 'LCIS Lower Campus', day_of_week = 'Thu–Fri', start_time = '9:00 AM', end_time = '12:00 PM'
 where slug = 'october-camp-2026' and name = 'October Mid-Term Camp';
update public.program_terms t
   set start_date = '2026-10-15', end_date = '2026-10-16',
       weekly_fee_cents = 10000, term_fee_cents = 10000,
       registration_closes_at = '2026-10-14T22:00:00Z',
       daily_start_time = '9:00 AM', daily_end_time = '12:00 PM',
       what_to_bring = 'Water bottle, shin pads, trainers or boots, sunscreen. Drop-off from 8:30.',
       notes = 'Futsal and ball mastery with the Futprep coaches.'
  from public.programs p
 where t.program_id = p.id and p.slug = 'october-camp-2026' and t.name = 'October 2026'
   and t.start_date = '2026-10-13';

-- Christmas camp, Thu 17 – Fri 18 Dec, registration opens Mon 2 Nov.
insert into public.programs (organization_id, slug, name, program_type, is_public, age_min, age_max, coed, location, day_of_week,
                             start_time, end_time, capacity, children_per_coach, active)
select o.id, 'christmas-camp-2026', 'Christmas Futsal & Ball Mastery Camp', 'camp', true, 6, 15, true, 'LCIS Lower Campus', 'Thu–Fri',
       '9:00 AM', '12:00 PM', 40, 10, false
  from public.organizations o
 where o.slug = 'futprep'
   and not exists (select 1 from public.programs where slug = 'christmas-camp-2026');

insert into public.program_terms (program_id, name, start_date, end_date, break_dates, weekly_fee_cents, term_fee_cents, registration_fee_cents,
                                  registration_opens_at, registration_closes_at, daily_start_time, daily_end_time, what_to_bring, notes, active)
select p.id, 'Christmas 2026', '2026-12-17', '2026-12-18', '{}', 10000, 10000, 0,
       '2026-11-02T05:00:00Z', '2026-12-16T22:00:00Z', '9:00 AM', '12:00 PM',
       'Water bottle, shin pads, trainers or boots, sunscreen. Drop-off from 8:30.',
       'Futsal and ball mastery with the Futprep coaches.', false
  from public.programs p
 where p.slug = 'christmas-camp-2026'
on conflict (program_id, name) do nothing;
