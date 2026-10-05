-- A coach's photo that points at a file that was never there (brief 19,
-- part C, 5 Oct 2026). The first Futprep migration (202609030001) gave
-- Coach Ronaldo Greene the photo path /futprep/coaches/ronaldo-greene.jpg
-- as a placeholder; no such file was ever added to the site. Every page
-- that draws the team asked for it, got a 404, and showed his initials
-- instead: a browser error on each visit and nothing else.
--
-- Cleared, so the page goes straight to the initials. A real photo is
-- added from Futprep's Team screen (staff -> Team -> upload), which stores
-- it under a different address and is untouched by this.
update public.coach_profiles
   set photo_url = null
 where photo_url = '/futprep/coaches/ronaldo-greene.jpg';
