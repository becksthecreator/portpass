-- Futprep Term 2 (9 Jan - 13 Mar 2027, 10 Saturdays), as agreed with
-- Coach Alex in Nov 2026. PortPass runs the programmes for Futprep.
--
-- 1. The two Lyford Cay classes that already have a Term 2 row: the new
--    end date (13 Mar, not 20 Mar), the new per-child term prices,
--    registration opening on 7 Dec (midnight in Nassau), and the free
--    Kickoff Day on Sat 19 Dec as the pre-term taster (it replaces 12 Dec).
-- 2. New classes, each with its Term 2 row: Juniors at Lyford Cay, and
--    the three afternoon "FutPrep Fundamentals" groups. Fundamentals'
--    field (NSA or Meridian) is not confirmed, so those three and Juniors
--    (proposed) go in unlisted (is_public = false); staff list each one
--    from the programmes screen once it is confirmed.
--
-- The session trigger (public.generate_camp_sessions, 202610020001) does
-- the Saturdays: it adds 19 Dec and every Term 2 Saturday, and removes
-- 12 Dec and 20 Mar unless a child has attendance or a trial booked on it.
-- Safe to run twice: rows are found by programme slug and term name.

do $$
declare
  org bigint;
  lyford bigint;
  opens timestamptz := '2026-12-07 00:00:00 America/Nassau';
  prog record;
  pid bigint;
begin
  select id into org from public.organizations where slug = 'futprep';
  if org is null then
    return; -- a database without Futprep (a fresh local stack before its seed)
  end if;

  select id into lyford from public.locations
   where organization_id = org and name = 'LCIS Lower Campus';

  -- ---- 1. Lil Kickers and Kickers -----------------------------------------
  update public.programs set end_time = '9:30 AM'
   where organization_id = org and slug = 'lil-kickers';

  update public.program_terms t
     set end_date = '2027-03-13',
         break_dates = '{}',
         term_fee_cents = case p.slug when 'lil-kickers' then 34000 else 42000 end,
         weekly_fee_cents = case p.slug when 'lil-kickers' then 3400 else 4200 end,
         registration_opens_at = opens,
         early_access_until = null,
         taster_date = '2026-12-19'
    from public.programs p
   where t.program_id = p.id
     and p.organization_id = org
     and p.slug in ('lil-kickers', 'kickers')
     and t.name = 'Term 2';

  -- ---- 2. New classes -----------------------------------------------------
  for prog in
    select * from (values
      ('juniors', 'Futprep Juniors', 6, 9, 72, 119, '11:00 AM', '12:00 PM', 'LCIS Lower Campus', true, 45000,
       'Proposed for Term 2. List it once the 11:00 slot at Lyford Cay is confirmed.'),
      ('fundamentals-3-5', 'FutPrep Fundamentals (ages 3-5)', 3, 5, 36, 71, '3:00 PM', '4:00 PM', 'Venue to be confirmed (NSA or Meridian)', false, 45000,
       'Field not confirmed (NSA or Meridian). Set the site, then list it.'),
      ('fundamentals-6-8', 'FutPrep Fundamentals (ages 6-8)', 6, 8, 72, 107, '4:00 PM', '5:00 PM', 'Venue to be confirmed (NSA or Meridian)', false, 45000,
       'Field not confirmed (NSA or Meridian). Set the site, then list it.'),
      ('fundamentals-9-12', 'FutPrep Fundamentals (ages 9-12)', 9, 12, 108, 155, '5:00 PM', '6:00 PM', 'Venue to be confirmed (NSA or Meridian)', false, 45000,
       'Field not confirmed (NSA or Meridian). Set the site, then list it.')
    ) as v(slug, name, age_min, age_max, min_months, max_months, start_time, end_time, location, at_lyford, term_fee, note)
  loop
    select id into pid from public.programs where slug = prog.slug;
    if pid is null then
      insert into public.programs (organization_id, slug, name, age_min, age_max, age_min_months, age_max_months, coed,
                                   location, location_id, day_of_week, start_time, end_time, capacity, active, is_public,
                                   program_type, audience, staff_note)
      values (org, prog.slug, prog.name, prog.age_min, prog.age_max, prog.min_months, prog.max_months, true,
              prog.location, case when prog.at_lyford then lyford end, 'Saturday', prog.start_time, prog.end_time, 20, true, false,
              'term', 'children', prog.note)
      returning id into pid;
    end if;

    if not exists (select 1 from public.program_terms where program_id = pid and name = 'Term 2') then
      insert into public.program_terms (program_id, name, start_date, end_date, break_dates, weekly_fee_cents, term_fee_cents,
                                        registration_fee_cents, active, registration_opens_at, taster_date, trial_spots_per_session)
      values (pid, 'Term 2', '2027-01-09', '2027-03-13', '{}', prog.term_fee / 10, prog.term_fee,
              0, true, opens, case when prog.at_lyford then date '2026-12-19' end, 3);
    end if;
  end loop;
end $$;
