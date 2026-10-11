-- Brief 27 (A): a note on a program that only staff see, for things a
-- parent must never read, such as "Confirm with Alex before 2 Nov." on the
-- Christmas camp. Shown on /futprep/staff/programs; never on a public page,
-- in an email or in an export.
alter table public.programs
  add column if not exists staff_note text;

comment on column public.programs.staff_note is
  'Staff-only note shown on the programs page. Never shown to parents.';

-- The Christmas camp (program 159) stays public and opens on 2 Nov, but
-- its site is not yet confirmed with Coach Alex.
update public.programs
set staff_note = 'Confirm with Alex before 2 Nov.'
where id = 159 and slug = 'christmas-camp-2026' and staff_note is null;
