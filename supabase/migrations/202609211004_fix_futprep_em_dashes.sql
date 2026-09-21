-- Seeded copy used literal double hyphens ("--") where em dashes belong.
-- Fixing the three affected strings in place; no schema change.
update public.organizations set
  description = 'Futprep runs weekly football classes for young children in Nassau, led by Coach Alexander Thompson. Sign up online and pay by bank transfer — no phone calls, no forms at the field.'
where id = 1;

update public.offerings set
  summary = 'A first taste of organized football — short sessions built for little legs and short attention spans.'
where organization_id = 1 and slug = 'lil-kickers';

update public.offerings set
  summary = 'The next step up — real drills, real small-sided games, still built around having fun.'
where organization_id = 1 and slug = 'kickers';
