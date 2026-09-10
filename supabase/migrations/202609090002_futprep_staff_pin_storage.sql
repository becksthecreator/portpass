-- Move Futprep staff PIN storage from Vercel environment variables into
-- Supabase, so PINs can be reset without a deploy. Adds account_key/pin_hash
-- to staff_members and seeds all five named accounts (admin=Kiki, coach=Coach
-- Bex, ceo=Coach Alex, kione=Coach Kione, adon=Adon/Head Tech Admin) with a
-- temporary shared PIN of 1234 (sha256 hex digest below) for the CEO demo.
-- Staff should change these from the team workspace once that ships.

alter table public.staff_members
  add column if not exists account_key text,
  add column if not exists pin_hash text;

create unique index if not exists staff_members_account_key_idx
  on public.staff_members(account_key) where account_key is not null;

-- sha256("1234") = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
update public.staff_members
  set account_key = 'coach', pin_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
  where organization_id = 1 and name = 'Coach Bex' and role = 'coach';

update public.staff_members
  set account_key = 'admin', pin_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
  where organization_id = 1 and name = 'Kiki' and role = 'admin_registrar';

update public.staff_members
  set account_key = 'ceo', pin_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
  where organization_id = 1 and name = 'Coach Alex' and role = 'ceo';

-- select ... where exists(...) rather than a plain values() insert: this
-- migration predates organization_id 1 being guaranteed to exist (it always
-- did on production, where Futprep's org row was created before this ran,
-- but replaying every migration from scratch against an empty database -
-- e.g. the local Postgres instance integration tests run against - hit the
-- staff_members_organization_id_fkey constraint here otherwise). Identical
-- effect wherever organization 1 already exists; a safe no-op where it
-- doesn't yet.
insert into public.staff_members (organization_id, name, role, email, responsibilities, active, account_key, pin_hash, created_at)
select 1, 'Coach Kione', 'coach', null, 'Coaching workspace: sessions, roster, attendance, and private-session coaching.', true, 'kione', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', now()
where exists (select 1 from public.organizations where id = 1)
union all
select 1, 'Adon', 'admin_registrar', null, 'Head Tech Admin: team/coach profile management and technical operations.', true, 'adon', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', now()
where exists (select 1 from public.organizations where id = 1)
on conflict (organization_id, name, role) do update
  set account_key = excluded.account_key, pin_hash = excluded.pin_hash, active = true;
