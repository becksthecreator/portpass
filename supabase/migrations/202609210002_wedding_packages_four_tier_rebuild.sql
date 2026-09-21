-- Replace the three abstract "level of service" tiers with Antonio's
-- actual published WeddingWire prices, per the page-plan brief: six real
-- packages exist, but four are shown (Pink Sand, Yellow Elder, Poinciana,
-- Hibiscus) -- Pear and Bronze stay in the table as unpublished rows
-- rather than being deleted, in case they're brought back later.
--
-- Hibiscus's $3,500 (moved up from its old $2,000 WeddingWire listing) and
-- Poinciana's inclusion list (WeddingWire only lists "+ planning
-- consultation" at that tier) are the two things in this migration that
-- still need Antonio's sign-off -- see the brief's "Blocked on BEX" list.
update public.wedding_packages set
  slug = 'pink-sand', name = 'Pink Sand', tagline = 'Just the ceremony',
  price_from_cents = 50000, price_note = null, currency = 'BSD',
  includes = '["Antonio as your licensed officiant", "Ceremony script consultation", "Guidance on the marriage licence process"]'::jsonb,
  visibility = 'live', is_featured = false, sort_order = 0, updated_at = now()
where slug = 'ceremony';

update public.wedding_packages set
  slug = 'yellow-elder', name = 'Yellow Elder', tagline = 'Ceremony + photography',
  price_from_cents = 100000, price_note = null, currency = 'BSD',
  includes = '["Everything in Pink Sand", "Ceremony photography", "Licence paperwork handled"]'::jsonb,
  visibility = 'live', is_featured = false, sort_order = 1, updated_at = now()
where slug = 'ceremony-coordination';

update public.wedding_packages set
  slug = 'poinciana', name = 'Poinciana', tagline = 'The full island day',
  price_from_cents = 250000, price_note = null, currency = 'BSD',
  includes = '["Everything in Yellow Elder", "One hour of photography coverage", "Island transportation on the day", "Planning consultation with Antonio", "Ceremony rehearsal included (normally $60)", "Coordination with your photographer, florist and venue"]'::jsonb,
  visibility = 'live', is_featured = true, sort_order = 2, updated_at = now()
where slug = 'full-planning';

insert into public.wedding_packages (slug, name, tagline, description, includes, price_from_cents, price_note, currency, visibility, is_featured, sort_order)
values
  (
    'hibiscus', 'Hibiscus', 'Everything planned for you', null,
    '["Everything in Poinciana", "Venue selection and booking", "Flowers, photography and film arranged for you", "Full transport planning", "A single point of contact from first enquiry to the day itself"]'::jsonb,
    350000, null, 'BSD', 'live', false, 3
  ),
  (
    'pear', 'Pear', 'Ceremony, photography and transportation', null,
    '["Antonio as your licensed officiant", "Ceremony script consultation", "Guidance on the marriage licence process", "One hour of photography coverage", "Transportation on the day"]'::jsonb,
    150000, null, 'BSD', 'draft', false, 90
  ),
  (
    'bronze', 'Bronze', 'Ceremony, photography, transportation and planning', null,
    '["Everything in Pear", "Planning consultation with Antonio"]'::jsonb,
    300000, null, 'BSD', 'draft', false, 91
  )
on conflict (slug) do nothing;
