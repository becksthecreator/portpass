-- Brief 31 (B), 11 Oct 2026: where Futprep trains and what each place
-- costs. Futprep enters every amount itself on Staff -> Locations;
-- PortPass stores what it enters and never sets a price.
--
-- 1. Cost and use columns on locations, all optional except the switch:
--    cost_model   per_hour | per_session | per_term | free | school_pays
--    cost_cents   the amount for that model (BSD cents)
--    cost_note    anything else about the deal ("Alex to confirm")
--    surface      grass | turf | court | indoor
--    private_sessions_ok  whether parents may pick it for a private session
--    days_available       ISO weekdays it can be used, 1 = Monday (like
--                         coach_profiles.working_days); null = not said
--    hours_note           when it can be used, in words
-- 2. The duplicate field: location 1 "Lyford Cay Lower Campus Soccer Field"
--    is the same place as 68 "LCIS Lower Campus". Anything still pointing at
--    1 is moved to 68 (on 11 Oct nothing was: all four programs already
--    use 68), then 1 is switched off, never deleted, with an audit line.
--    Switch back: update public.locations set active = true where id = 1;
--    Switch back step 3 (the column grants, below): grant select on
--    public.locations to anon, authenticated;
-- The new columns can stay: nothing reads them unless a screen asks.

alter table public.locations add column if not exists cost_model text;
alter table public.locations add column if not exists cost_cents integer;
alter table public.locations add column if not exists cost_note text;
alter table public.locations add column if not exists surface text;
alter table public.locations add column if not exists private_sessions_ok boolean not null default false;
alter table public.locations add column if not exists days_available smallint[];
alter table public.locations add column if not exists hours_note text;

alter table public.locations drop constraint if exists locations_cost_model_check;
alter table public.locations add constraint locations_cost_model_check
  check (cost_model is null or cost_model in ('per_hour', 'per_session', 'per_term', 'free', 'school_pays'));
alter table public.locations drop constraint if exists locations_cost_cents_check;
alter table public.locations add constraint locations_cost_cents_check
  check (cost_cents is null or (cost_cents >= 0 and cost_cents <= 10000000));
alter table public.locations drop constraint if exists locations_surface_check;
alter table public.locations add constraint locations_surface_check
  check (surface is null or surface in ('grass', 'turf', 'court', 'indoor'));
alter table public.locations drop constraint if exists locations_days_available_check;
alter table public.locations add constraint locations_days_available_check
  check (days_available is null or days_available <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);
alter table public.locations drop constraint if exists locations_notes_length_check;
alter table public.locations add constraint locations_notes_length_check
  check (coalesce(length(cost_note), 0) <= 300 and coalesce(length(hours_note), 0) <= 300);

-- The duplicate field: move anything still on 1 to 68, then switch 1 off.
do $$
declare
  moved integer := 0;
begin
  if exists (select 1 from public.locations where id = 1 and organization_id = 1 and name = 'Lyford Cay Lower Campus Soccer Field')
     and exists (select 1 from public.locations where id = 68 and organization_id = 1 and name = 'LCIS Lower Campus') then
    update public.programs set location_id = 68 where location_id = 1;
    get diagnostics moved = row_count;
    update public.locations set active = false where id = 1 and active;
    if found then
      insert into public.audit_log (organization_id, action, target_table, target_id, before, after)
      values (1, 'location.duplicate_hidden', 'locations', '1', jsonb_build_object('active', true),
              jsonb_build_object('active', false, 'same_place_as', 68, 'programs_moved', moved, 'brief', 31));
    end if;
  end if;
end;
$$;

-- 3. What Futprep pays for a field is its own business. Browsers could read
--    every column of an active location of a public business
--    (202610180001); they keep exactly the columns they had, and none of
--    the new ones.
revoke select on public.locations from anon, authenticated;
grant select (id, organization_id, name, address, map_label, active, created_at) on public.locations to anon, authenticated;
