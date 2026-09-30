-- Brief 13 (30 Sept), part 4: private-session tiers priced per child.
-- Futprep's price list: 1 child $80 (private-1on1), 2 children $120 ($60
-- each, private-pair), 3 children $135 ($45 each, private-trio), 4 to 8
-- children $35 each (private-group). The 1-on-1 and pair prices were set
-- directly on 30 Sept and are NOT touched here; the two new tiers are only
-- inserted if missing. private-pack-4 stays unpublished (not on Futprep's
-- price list). Re-runnable.

-- "per child" as a price unit.
alter table public.offerings drop constraint if exists offerings_price_unit_check;
alter table public.offerings add constraint offerings_price_unit_check
  check (price_unit in ('per_session', 'per_term', 'per_hour', 'per_day', 'per_person', 'per_child', 'from'));

-- How many children a request is for (a group session is priced per child).
alter table public.private_session_requests
  add column if not exists children_count integer not null default 1 check (children_count between 1 and 8);

insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, inclusions, sort_order, is_published)
select o.id, 'service', v.slug, v.name, v.summary, v.price_cents, v.price_unit, v.inclusions, v.sort_order, true
  from public.organizations o
 cross join (values
   ('private-trio', '3-on-1 Session', 'Three children, one coach: siblings or friends training together.', 13500, 'per_session',
    array['45 minutes', '3 children', '$45 per child'], 52),
   ('private-group', 'Group Session (4+)', 'A small group of 4 to 8 children with one coach, priced per child.', 3500, 'per_child',
    array['45 minutes', '4 to 8 children', '$35 per child'], 53)
 ) as v(slug, name, summary, price_cents, price_unit, inclusions, sort_order)
 where o.slug = 'futprep'
on conflict (organization_id, slug) do nothing;

-- Keep the list in price order: 1-on-1, pair, trio, group, then the pack and
-- the party. Only the order changes.
update public.offerings f set sort_order = 54
  from public.organizations o
 where f.organization_id = o.id and o.slug = 'futprep' and f.slug = 'private-pack-4' and f.sort_order = 52;
update public.offerings f set sort_order = 55
  from public.organizations o
 where f.organization_id = o.id and o.slug = 'futprep' and f.slug = 'birthday-party' and f.sort_order = 53;
