-- Brief 13 (30 Sept), parts 1-3: Futprep sites, school-contract programs
-- and the coach pay ledger. Pay model: Coach Bex is paid $50 per class,
-- assistants and the field are paid by Futprep, and the rest is Alex's.
-- Re-runnable.

-- ---- 1. Sites ---------------------------------------------------------------
insert into public.locations (organization_id, name, address, map_label, active)
select o.id, v.name, v.address, v.map_label, true
  from public.organizations o
 cross join (values
   ('LCIS Lower Campus', 'Lyford Cay International School, Lower Campus, Lyford Cay, New Providence', 'Lyford Cay'),
   ('Meridian School', 'Meridian School, Nassau, New Providence', 'Meridian School'),
   ('Winton (Out East)', 'Winton, eastern New Providence', 'Out East'),
   ('St Andrew''s School', 'St Andrew''s School, Nassau, New Providence', 'St Andrew''s')
 ) as v(name, address, map_label)
 where o.slug = 'futprep'
on conflict (organization_id, name) do nothing;

alter table public.programs
  add column if not exists location_id bigint references public.locations(id) on delete set null;
create index if not exists programs_location_idx on public.programs (location_id);

-- Backfill from the location text; programs.location itself is unchanged.
update public.programs p
   set location_id = l.id
  from public.locations l
  join public.organizations o on o.id = l.organization_id and o.slug = 'futprep'
 where p.organization_id = o.id
   and p.location_id is null
   and case l.name
         when 'LCIS Lower Campus' then p.location ilike '%lyford cay%' or p.location ilike '%lcis%'
         when 'Meridian School' then p.location ilike '%meridian%'
         when 'Winton (Out East)' then p.location ilike '%winton%' or p.location ilike '%out east%'
         when 'St Andrew''s School' then p.location ilike '%st%andrew%'
         else false
       end;

-- ---- 2. School-contract programs -------------------------------------------
-- A contract is coaching a school pays Futprep for: never public, never
-- registrable. Staff keep a roster by name (the school holds the parent
-- and medical details) and mark attendance; Futprep invoices the school.
alter table public.programs drop constraint if exists programs_program_type_check;
alter table public.programs add constraint programs_program_type_check
  check (program_type in ('term', 'camp', 'contract'));

alter table public.programs
  add column if not exists contract_client text,
  add column if not exists contract_fee_cents integer check (contract_fee_cents is null or contract_fee_cents >= 0),
  add column if not exists contract_billing text check (contract_billing is null or contract_billing in ('per_session', 'per_term'));

-- is_public is forced false for a contract, whatever the insert says.
create or replace function public.programs_contract_private()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.program_type = 'contract' then
    new.is_public := false;
  end if;
  return new;
end;
$$;
revoke all on function public.programs_contract_private() from public, anon, authenticated;
drop trigger if exists programs_contract_private on public.programs;
create trigger programs_contract_private
  before insert or update of program_type, is_public on public.programs
  for each row execute function public.programs_contract_private();

alter table public.programs drop constraint if exists programs_contract_terms;
alter table public.programs add constraint programs_contract_terms
  check (program_type <> 'contract'
         or (not is_public and contract_client is not null and contract_fee_cents is not null and contract_billing is not null));

-- ---- 3. Coach pay ledger ----------------------------------------------------
-- Default rates per coach; everything but Coach Bex's lead rate stays empty
-- until Alex sets it. staff_member_id ties a coach to their staff login so
-- a coach sees only their own pay.
alter table public.coach_profiles
  add column if not exists default_lead_pay_cents integer check (default_lead_pay_cents is null or default_lead_pay_cents >= 0),
  add column if not exists default_assistant_pay_cents integer check (default_assistant_pay_cents is null or default_assistant_pay_cents >= 0),
  add column if not exists staff_member_id bigint references public.staff_members(id) on delete set null;
create unique index if not exists coach_profiles_staff_member_idx
  on public.coach_profiles (staff_member_id) where staff_member_id is not null;

-- Who coached each session, in what role, and what they're owed.
create table if not exists public.session_staff (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references public.sessions(id) on delete cascade,
  coach_id    bigint not null references public.coach_profiles(id) on delete restrict,
  role        text not null check (role in ('lead', 'assistant')),
  pay_cents   integer not null default 0 check (pay_cents >= 0),
  paid_at     timestamptz,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (session_id, coach_id)
);
create index if not exists session_staff_coach_idx on public.session_staff (coach_id);
alter table public.session_staff enable row level security;
revoke all on public.session_staff from anon, authenticated;

-- The coach who leads a class unless the roster says otherwise, and the
-- field hire for a term (for the program P&L; unknown until Alex says).
alter table public.programs
  add column if not exists default_lead_coach_id bigint references public.coach_profiles(id) on delete set null,
  add column if not exists field_cost_cents_per_term integer check (field_cost_cents_per_term is null or field_cost_cents_per_term >= 0);

-- Coach Bex: $50 per class as lead, and the lead for Lil Kickers and
-- Kickers.
update public.coach_profiles c
   set default_lead_pay_cents = 5000
  from public.organizations o
 where c.organization_id = o.id and o.slug = 'futprep'
   and c.slug = 'antonio-beckford-jr' and c.default_lead_pay_cents is null;

update public.programs p
   set default_lead_coach_id = c.id
  from public.coach_profiles c
 where c.organization_id = p.organization_id
   and c.slug = 'antonio-beckford-jr'
   and p.slug in ('lil-kickers', 'kickers')
   and p.default_lead_coach_id is null;

-- The two coaches who already have staff logins. Alex links the rest on
-- the Coach pay page.
update public.coach_profiles c
   set staff_member_id = s.id
  from public.staff_members s
 where s.organization_id = c.organization_id
   and s.account_key is not null
   and c.staff_member_id is null
   and ((c.slug = 'antonio-beckford-jr' and s.name = 'Antonio Beckford')
     or (c.slug = 'alexander-thompson' and s.name = 'Alexander Thompson'))
   and not exists (select 1 from public.coach_profiles other where other.staff_member_id = s.id);
