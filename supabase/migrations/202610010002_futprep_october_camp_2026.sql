-- Futprep October Mid-Term Camp 2026 (brief 06 v2, A2): Tue 13 - Fri 16 Oct,
-- 9:00-12:00 daily, registration closing Mon 12 Oct at 6 pm Nassau
-- (22:00 UTC).
--
-- CREATED SWITCHED OFF. The ages, capacity and camp fee below are
-- PLACEHOLDERS until Antonio sends Alex's answers; nothing is public or
-- registrable while program.active and term.active are false. Once the
-- numbers are confirmed, switching it on is one statement (fill in the
-- real values):
--
--   update public.programs set age_min = ?, age_max = ?, capacity = ?, active = true
--    where slug = 'october-camp-2026';
--   update public.program_terms set term_fee_cents = ?, active = true, notes = null
--    where program_id = (select id from public.programs where slug = 'october-camp-2026')
--      and name = 'October 2026';
--
-- The four camp days (sessions) are created by the program_terms trigger
-- (public.generate_camp_sessions) when the term row goes in. Re-runnable.

insert into public.programs (organization_id, slug, name, program_type, is_public, age_min, age_max, coed, location, day_of_week, start_time, end_time, capacity, active)
select o.id, 'october-camp-2026', 'October Mid-Term Camp', 'camp', true,
       4, 12,            -- PLACEHOLDER ages (CONFIRM with Alex)
       true,
       'Lyford Cay Lower Campus Soccer Field', 'Weekdays', '9:00 AM', '12:00 PM',
       30,               -- PLACEHOLDER capacity (CONFIRM with Alex)
       false
  from public.organizations o
 where o.slug = 'futprep'
   and not exists (select 1 from public.programs where slug = 'october-camp-2026');

insert into public.program_terms (program_id, name, start_date, end_date, break_dates, weekly_fee_cents, term_fee_cents, registration_fee_cents,
                                  registration_closes_at, daily_start_time, daily_end_time, notes, active)
select p.id, 'October 2026', '2026-10-13', '2026-10-16', '{}', 0,
       0,                -- PLACEHOLDER camp fee in cents (CONFIRM with Alex)
       0,
       '2026-10-12T22:00:00Z', '9:00 AM', '12:00 PM',
       'PLACEHOLDER: ages, capacity and camp fee await Alex. Do not activate until they are filled in.',
       false
  from public.programs p
 where p.slug = 'october-camp-2026'
on conflict (program_id, name) do nothing;
