-- Brief 29, part B: what a private session is comes from the database, not
-- from a map of slugs in code.
--
-- 1. offerings gains duration_minutes, min_children and max_children, so
--    any published service of a business can be booked with the right
--    length and price. Futprep's rows are filled in: the 30 and 60 minute
--    sessions Antonio set on 8 Oct (audit_log 58), the unpublished pair,
--    trio and group tiers at 45 minutes, the pack at 45, the party at 90.
--
-- 2. One reference prefix everywhere: a private-session request is now
--    numbered from the business's payment settings like a payment request
--    (FP-0042) and a booking (FP-B0007): FP-S0001, FP-S0002, ... The old
--    PS-2026-XXXXXXX codes on existing rows stay as they are.

alter table public.offerings
  add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes between 15 and 480),
  add column if not exists min_children integer not null default 1 check (min_children >= 1),
  add column if not exists max_children integer not null default 1 check (max_children >= 1);
alter table public.offerings drop constraint if exists offerings_children_range_check;
alter table public.offerings add constraint offerings_children_range_check check (max_children >= min_children);
comment on column public.offerings.duration_minutes is 'How long one booking of this service lasts. Null for an offering that is not a timed session.';
comment on column public.offerings.min_children is 'For a session for children: how many it is priced for, at least.';
comment on column public.offerings.max_children is 'For a session for children: how many it is priced for, at most. A price per child is multiplied by the number chosen in this range.';

update public.offerings f
   set duration_minutes = v.duration_minutes, min_children = v.min_children, max_children = v.max_children
  from public.organizations o,
       (values
         ('private-1on1', 30, 1, 1),
         ('private-60', 60, 1, 1),
         ('private-pair', 45, 2, 2),
         ('private-trio', 45, 3, 3),
         ('private-group', 45, 4, 8),
         ('private-pack-4', 45, 1, 1),
         ('birthday-party', 90, 1, 1)
       ) as v(slug, duration_minutes, min_children, max_children)
 where f.organization_id = o.id and o.slug = 'futprep' and f.slug = v.slug and f.type = 'service';

alter table public.organization_payment_settings
  add column if not exists next_session_number integer not null default 1 check (next_session_number > 0);

-- References are unique within a business, as payment requests' and
-- bookings' are (two businesses may share a prefix). The old global unique
-- goes; existing PS- codes stay unique anyway.
alter table public.private_session_requests drop constraint if exists private_session_requests_reference_code_key;
drop index if exists public.private_session_requests_reference_code_key;
create unique index if not exists private_session_requests_org_reference_key on public.private_session_requests (organization_id, reference_code);

-- The next reference for a private-session request of a business:
-- "<prefix>-S0001". Makes the settings row if the business has none yet,
-- with the prefix the caller worked out from the business's name (the same
-- rule payment requests use). Service role only; a plain invoker function
-- like payment_request_create, since the service role bypasses RLS.
create or replace function public.private_session_next_reference(p_org bigint, p_default_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_number integer;
  v_prefix text;
begin
  insert into public.organization_payment_settings (organization_id, reference_prefix)
  values (p_org, p_default_prefix)
  on conflict (organization_id) do nothing;

  update public.organization_payment_settings
     set next_session_number = next_session_number + 1
   where organization_id = p_org
  returning next_session_number - 1, reference_prefix into v_number, v_prefix;

  return v_prefix || '-S' || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end;
end;
$$;

revoke all on function public.private_session_next_reference(bigint, text) from public, anon, authenticated;
grant execute on function public.private_session_next_reference(bigint, text) to service_role;
