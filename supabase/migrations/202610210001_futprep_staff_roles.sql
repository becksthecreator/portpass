-- Brief 31 (A), 11 Oct 2026: one person, one staff login, one role
-- (docs/futprep/roles.md).
--
-- 1. Two switches on staff_members:
--    can_view_medical: an admin login sees a child's allergies, conditions,
--      medications and special needs only when it is on (the CEO login
--      always does). Admin logins that see them today keep them.
--    is_owner: the one login marked as Futprep's owner, for the bridge to
--      a PortPass owner membership (Staff accounts).
-- 2. Duplicate rows switched off, never deleted, each with an audit_log
--    line: 1 "Coach Bex" (kept: 39), 2 "Kiki" (kept: 43), 3 "Coach Alex"
--    (kept: 40). Row 10 "Coach Kione" and Ronaldo's 42 are left as they are
--    until Antonio says.
--    Switch back: update public.staff_members set active = true where id in (1, 2, 3);
-- 3. Every coach profile tied to a staff row: Kiki's profile (4) to 43,
--    Ronaldo's (2) to 42 (still switched off), and a new staff row each for
--    Dre (13) and Ricardo (127): role coach, no login, no PIN, no email.
--    Switch back: update public.coach_profiles set staff_member_id = null where id in (2, 4, 13, 127);
--    and switch the two new rows off (their ids are in audit_log, action
--    staff.row_added).
--
-- Every data step names its row by id AND name (or slug), so on a database
-- where those ids are other rows (CI, a branch) nothing changes.

alter table public.staff_members add column if not exists can_view_medical boolean not null default false;
alter table public.staff_members add column if not exists is_owner boolean not null default false;
create unique index if not exists staff_members_one_owner on public.staff_members (organization_id) where is_owner;

-- Admin logins that see medical details today keep them; the CEO can
-- switch each off in Staff accounts.
with kept as (
  update public.staff_members
  set can_view_medical = true
  where organization_id = 1 and role = 'admin' and account_key is not null and pin_hash is not null and not can_view_medical
  returning id, name
)
insert into public.audit_log (organization_id, action, target_table, target_id, before, after)
select 1, 'staff.medical_view_kept', 'staff_members', id::text, jsonb_build_object('can_view_medical', false), jsonb_build_object('can_view_medical', true, 'name', name, 'brief', 31)
from kept;

-- Duplicates off.
with hidden as (
  update public.staff_members
  set active = false
  where organization_id = 1 and active
    and ((id = 1 and name = 'Coach Bex') or (id = 2 and name = 'Kiki') or (id = 3 and name = 'Coach Alex'))
  returning id, name
)
insert into public.audit_log (organization_id, action, target_table, target_id, before, after)
select 1, 'staff.duplicate_hidden', 'staff_members', id::text, jsonb_build_object('active', true),
       jsonb_build_object('active', false, 'name', name, 'kept', case id when 1 then 39 when 2 then 43 when 3 then 40 end, 'brief', 31)
from hidden;

-- Kiki's and Ronaldo's profiles to the logins they already have.
with linked as (
  update public.coach_profiles c
  set staff_member_id = s.id, updated_at = now()
  from public.staff_members s
  where c.organization_id = 1 and c.staff_member_id is null and s.organization_id = 1
    and ((c.id = 4 and c.slug = 'keione-rayside' and s.id = 43 and s.name = 'Keione')
      or (c.id = 2 and c.slug = 'ronaldo-greene' and s.id = 42 and s.name = 'Ronaldo'))
  returning c.id as coach_id, c.slug, s.id as staff_id
)
insert into public.audit_log (organization_id, action, target_table, target_id, before, after)
select 1, 'coach.staff_linked', 'coach_profiles', coach_id::text, jsonb_build_object('staff_member_id', null),
       jsonb_build_object('staff_member_id', staff_id, 'slug', slug, 'brief', 31)
from linked;

-- Dre and Ricardo: a staff row each, then tie their profiles to it.
with targets as (
  select c.id, c.slug, regexp_replace(c.display_name, '^Coach ', '') as name
  from public.coach_profiles c
  where c.organization_id = 1 and c.staff_member_id is null
    and ((c.id = 13 and c.slug = 'dre') or (c.id = 127 and c.slug = 'ricardo-mcphee'))
),
added as (
  insert into public.staff_members (organization_id, name, role, responsibilities, active)
  select 1, t.name, 'coach', '', true from targets t
  on conflict (organization_id, name, role) do nothing
  returning id, name
),
linked as (
  update public.coach_profiles c
  set staff_member_id = a.id, updated_at = now()
  from targets t join added a on a.name = t.name
  where c.id = t.id
  returning c.id as coach_id, c.slug, a.id as staff_id, a.name
)
insert into public.audit_log (organization_id, action, target_table, target_id, before, after)
select 1, 'staff.row_added', 'staff_members', staff_id::text, null,
       jsonb_build_object('name', name, 'role', 'coach', 'coach_profile', coach_id, 'slug', slug, 'brief', 31)
from linked;
