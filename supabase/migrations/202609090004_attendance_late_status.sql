-- Adds "late" as a fourth attendance status alongside present/absent/excused,
-- since real coaches need to record it. Purely additive: existing rows
-- already satisfy the widened check.

alter table public.attendance
  drop constraint if exists attendance_status_check;
alter table public.attendance
  add constraint attendance_status_check
  check (status in ('present','absent','excused','late'));
