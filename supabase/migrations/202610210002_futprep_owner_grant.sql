-- Brief 31 (A4), 11 Oct 2026, after review: owner access to Futprep on
-- PortPass is given by a founder, never by a staff PIN session.
--
-- A staff login marked as the owner (staff_members.is_owner, 202610210001)
-- only asks. A platform owner, signed in with the admin second step,
-- grants the org_owner membership in Admin -> People. owner_user_id
-- records the PortPass sign-in that grant went to, so it can be taken
-- back: when the mark moves to another login, when the login is switched
-- off, or when its email changes (db/futprepOwner.ts). Null means no grant
-- is attached to this login.
--
-- Switch back: alter table public.staff_members drop column owner_user_id;

alter table public.staff_members
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

comment on column public.staff_members.owner_user_id is
  'The PortPass sign-in a founder gave owner access to from this staff login (brief 31). Taken back when the owner mark moves, the login is switched off or its email changes.';
