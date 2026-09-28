-- Staff PIN hygiene (website refinement round 4, item 10).
-- Records when a staff account last changed its own PIN, so the admin /
-- CEO staff list can show "PIN changed / not yet" per person. Never the
-- PIN, never the hash.
alter table public.staff_members
  add column if not exists pin_changed_at timestamptz;

comment on column public.staff_members.pin_changed_at is
  'When this account last changed its own PIN (null = still on the PIN an admin set).';
