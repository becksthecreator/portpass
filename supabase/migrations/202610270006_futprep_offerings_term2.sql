-- Futprep's public class pages for Term 2 (19 Nov 2026).
--
-- /sports-fitness/futprep-athletics/lil-kickers and /kickers read the
-- `offerings` rows, not the classes registration reads (programs and
-- program_terms). 202610270004 moved the classes to Term 2 but not these
-- rows, so the pages still showed Term 1 (5 Sep – 5 Dec) at $35 and $45
-- per session. This puts them on Term 2 as registration has it:
-- 9 Jan – 13 Mar 2027, $340 and $420 per child per term, and Lil Kickers
-- at 9:00-9:30. The badge ("Registration opens Mon 7 Dec") now comes from
-- program_terms in code, so no date to keep in step here.
--
-- Juniors and the three Fundamentals groups get no offering yet: they are
-- unlisted until their slot and field are confirmed (202610270004).
-- Safe to run twice.

update public.offerings o
   set term_start = date '2027-01-09',
       term_end = date '2027-03-13',
       price_cents = case o.slug when 'lil-kickers' then 34000 else 42000 end,
       price_unit = 'per_term',
       schedule_text = case o.slug
         when 'lil-kickers' then 'Saturdays, 9:00-9:30 AM · Lyford Cay Lower Campus Soccer Field'
         else 'Saturdays, 10:00-10:45 AM · Lyford Cay Lower Campus Soccer Field'
       end,
       updated_at = now()
  from public.organizations g
 where g.id = o.organization_id
   and g.slug = 'futprep'
   and o.slug in ('lil-kickers', 'kickers');
