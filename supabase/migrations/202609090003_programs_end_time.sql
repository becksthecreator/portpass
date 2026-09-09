-- Adds an end_time to programs so class time ranges (e.g. "9:00 AM–9:35 AM")
-- can be shown without hardcoding them per program in application code.
-- Needed for staff-created programs (e.g. Futprep Out East) to carry their
-- own end time, same as the two Term 1 pilot programs.

alter table public.programs
  add column if not exists end_time text;

update public.programs set end_time = '9:35 AM' where slug = 'lil-kickers' and end_time is null;
update public.programs set end_time = '10:45 AM' where slug = 'rookies' and end_time is null;
