-- Futprep brief 06 v2, Part B (30 Sept): private sessions and parties,
-- bookable with prices. The request/accept/refer inbox already exists;
-- this adds the price list, slots a parent can pick, payment tracking
-- against the PS- code, and the coach nickname.

alter table public.coach_profiles
  add column if not exists nickname text;

alter table public.private_session_requests
  -- Which priced service (an offerings slug) and its price when booked.
  add column if not exists service_slug text,
  add column if not exists price_cents integer check (price_cents is null or price_cents >= 0),
  -- The coach's open slot the parent picked (null = "suggest a time").
  add column if not exists availability_id bigint references public.coach_availability(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid','waived'));

-- Money received for a private session, recorded against its PS- code.
alter table public.payments
  add column if not exists private_session_request_id bigint references public.private_session_requests(id) on delete cascade;
create index if not exists payments_private_session_idx on public.payments (private_session_request_id) where private_session_request_id is not null;

-- The price list. PLACEHOLDER PRICES until Antonio confirms Alex's
-- numbers, so they are created UNPUBLISHED: not on the public Futprep page
-- and not offered on the coach page until switched on. Re-runnable; edit
-- the numbers here and re-run, then publish with:
--   update public.offerings set is_published = true
--    where organization_id = (select id from public.organizations where slug = 'futprep')
--      and slug in ('private-1on1','private-pair','private-pack-4','birthday-party');
insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, inclusions, sort_order, is_published)
select o.id, 'service', v.slug, v.name, v.summary, v.price_cents, v.price_unit, v.inclusions, v.sort_order, false
  from public.organizations o
 cross join (values
   ('private-1on1',   '1-on-1 Session',          'One coach, one player, built around what your child needs.', 6000,  'per_session', array['45 minutes'], 50),
   ('private-pair',   'Pair Session',            'Two children train together with one coach.',                9000,  'per_session', array['45 minutes','2 children'], 51),
   ('private-pack-4', '4-Session Pack',          'Four 1-on-1 sessions.',                                      22000, null,          array['Four 45-minute sessions','Use within 8 weeks'], 52),
   ('birthday-party', 'Birthday Football Party', 'Football games and a coach-led party on the field.',         30000, null,          array['90 minutes','Up to 15 children','2 coaches'], 53)
 ) as v(slug, name, summary, price_cents, price_unit, inclusions, sort_order)
 where o.slug = 'futprep'
on conflict (organization_id, slug) do update set
  name = excluded.name,
  summary = excluded.summary,
  price_cents = excluded.price_cents,
  price_unit = excluded.price_unit,
  inclusions = excluded.inclusions,
  sort_order = excluded.sort_order,
  updated_at = now();
