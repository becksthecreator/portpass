-- Futprep brief 06 v2, Part A (30 Sept): registration for any program and
-- term, and holiday camps. Term 1 keeps running untouched; nothing here
-- changes its rows beyond the new columns' defaults (term, public).

alter table public.programs
  add column if not exists program_type text not null default 'term'
    check (program_type in ('term','camp')),
  -- false = not listed on /futprep/camps or the class picker, but still
  -- registrable by a direct /futprep/register?program=&term= link.
  add column if not exists is_public boolean not null default true;

alter table public.program_terms
  -- The registration window. Null on either side = no limit that side.
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz,
  -- Returning-family early access (Part C).
  add column if not exists early_access_until timestamptz,
  -- Camps: the daily hours (programs.start_time/end_time stay the
  -- weekly-class times for term programs).
  add column if not exists daily_start_time text,
  add column if not exists daily_end_time text,
  add column if not exists what_to_bring text,
  add column if not exists notes text;

-- A camp runs every weekday (Mon-Fri) from start_date to end_date, less
-- break_dates. Its sessions (one per day, for the roster and attendance)
-- are generated here whenever a camp term is created or its dates change,
-- so a camp added by SQL, by the staff Programs screen or by a migration
-- all get their days. Existing sessions are never deleted (attendance
-- hangs off them); a day that was removed has to be cancelled by staff.
create or replace function public.generate_camp_sessions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  prog record;
begin
  select id, program_type, start_time, location
    into prog
    from public.programs
   where id = new.program_id;
  if prog.program_type is distinct from 'camp' then
    return new;
  end if;

  insert into public.sessions (program_id, term_id, session_date, start_time, location, status)
  select new.program_id,
         new.id,
         d::date,
         coalesce(nullif(new.daily_start_time, ''), prog.start_time),
         prog.location,
         'scheduled'
    from generate_series(new.start_date::timestamp, new.end_date::timestamp, interval '1 day') as d
   where extract(isodow from d) between 1 and 5
     and not (d::date = any(coalesce(new.break_dates, '{}'::date[])))
  on conflict (program_id, term_id, session_date) do nothing;

  return new;
end;
$$;

revoke all on function public.generate_camp_sessions() from public, anon, authenticated;

drop trigger if exists program_terms_camp_sessions on public.program_terms;
create trigger program_terms_camp_sessions
  after insert or update of start_date, end_date, break_dates, daily_start_time
  on public.program_terms
  for each row execute function public.generate_camp_sessions();
