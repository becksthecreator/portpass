-- Seed Futprep's listing content on the new template system. Every value
-- here is real: schedule/ages/capacity/fees match the live programs and
-- program_terms rows (the same numbers already public on the current
-- /futprep/programs page), and the bio is Coach Alexander Thompson's own
-- already-public coach_profiles row. The one open item is that Alex hasn't
-- personally confirmed these specific fee figures out loud -- they were
-- reconstructed from payment records when this system was built -- so this
-- is carrying forward numbers already live, not introducing new ones.
update public.organizations set
  primary_category = 'sports-fitness',
  island = 'New Providence',
  area = 'Lyford Cay',
  one_liner = 'Saturday football classes for kids ages 3-7 at Lyford Cay.',
  description = 'Futprep runs weekly football classes for young children in Nassau, led by Coach Alexander Thompson. Sign up online and pay by bank transfer -- no phone calls, no forms at the field.',
  owner_name = 'Coach Alexander Thompson',
  owner_bio = 'Head Coach of the Bahamas U14 Boys National Team, Head Coach of the University of The Bahamas men''s soccer program, and Head Coach at NLS Lyford Cay. A licensed USA Soccer coach bringing national-team and collegiate-level experience to every Futprep session.'
where id = 1;

insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, inclusions, schedule_text, age_min, age_max, term_start, term_end, capacity, action_url, sort_order, is_featured, is_published)
values
  (1, 'program', 'lil-kickers', 'Futprep Lil Kickers',
   'A first taste of organized football -- short sessions built for little legs and short attention spans.',
   3500, 'per_session',
   array['20-minute weekly session', 'Small group, ages 3-5', 'Coach Alexander Thompson'],
   'Saturdays, 9:00-9:35 AM · Lyford Cay Lower Campus Soccer Field',
   3, 5, '2026-09-05', '2026-12-05',
   20, '/futprep/register?program=lil-kickers', 0, false, true),
  (1, 'program', 'kickers', 'Futprep Kickers',
   'The next step up -- real drills, real small-sided games, still built around having fun.',
   4500, 'per_session',
   array['45-minute weekly session', 'Small group, ages 5-7', 'Coach Alexander Thompson'],
   'Saturdays, 10:00-10:45 AM · Lyford Cay Lower Campus Soccer Field',
   5, 7, '2026-09-05', '2026-12-05',
   20, '/futprep/register?program=kickers', 1, false, true)
on conflict (organization_id, slug) do nothing;

update public.organizations set is_published = true where id = 1;
