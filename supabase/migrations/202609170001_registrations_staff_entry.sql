-- Lets staff create a registration directly (Futprep Term 1 migration: 18
-- real, already-attending children exist with zero registration rows).
-- entered_by_staff records who fast-tracked it, so these are auditable and
-- distinguishable from a parent's own submission when following up for full
-- consent/medical detail later.
alter table public.registrations
  add column if not exists entered_by_staff text;
