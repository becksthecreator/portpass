-- The program was renamed "Rookies" -> "Futprep Kickers" but its slug
-- stayed "rookies". Now that the slug becomes part of a real URL
-- (/futprep/[program]), update it in place (not insert-a-new-row) so
-- every existing FK reference by program_id is untouched.
update public.programs set slug = 'kickers' where slug = 'rookies';

-- Registration is moving from a program-prefixed path to an org-level one.
update public.organizations set registration_url = '/futprep/register' where id = 1;
