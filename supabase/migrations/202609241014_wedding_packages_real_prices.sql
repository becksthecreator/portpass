-- Corrects every live wedding package price and inclusion list against
-- Antonio Beckford's own printed price list (24 Sept 2026), replacing the
-- placeholder/derived data that shipped in 202609210002. Two of these are
-- not cosmetic: Hibiscus was live at $3,500 for what is actually a $1,960
-- package (nearly double), and every card falsely told couples "Marriage
-- licence government fee not included" when the licence is the first
-- included item on every single tier. Both directly misled couples about
-- money they did or didn't owe.
--
-- "Exposures" (36/72, film-camera language) is replaced with hours per
-- Antonio's confirmed $300/hr photography and $500/hr video rates -- his
-- printed list gives no duration for the top two tiers, so 1hr/2hr here is
-- an interpretation (see the brief), not a figure he's confirmed letter for
-- letter. Ship it now since "36 Exposures" is meaningless to a couple in
-- 2026 either way; revisit the exact hour count if he corrects it.
-- includes is jsonb (not a Postgres array column) -- to_jsonb() over a text[]
-- literal is the simplest way to write a jsonb array of strings inline.
update public.wedding_packages set
  price_from_cents = 55000,
  includes = to_jsonb(array[
    'A Bahamas Government Marriage License',
    'The performance of the ceremony at the hotel of the couple or another wedding site',
    'Photos not included'
  ]),
  sort_order = 0
where slug = 'pink-sand';

update public.wedding_packages set
  price_from_cents = 110000,
  includes = to_jsonb(array[
    'Marriage License',
    'Photographer for one hour',
    'The performance of the ceremony at a beach site or guest''s hotel'
  ]),
  sort_order = 1
where slug = 'yellow-elder';

update public.wedding_packages set
  price_from_cents = 150000,
  tagline = 'Ceremony, photography and a limousine',
  includes = to_jsonb(array[
    'Marriage License',
    'Photographer for one hour',
    'A limousine',
    'The performance of the ceremony at a beach site or guest''s hotel'
  ]),
  sort_order = 2,
  visibility = 'live'
where slug = 'pear';

update public.wedding_packages set
  price_from_cents = 196000,
  tagline = 'Ceremony, photography and video',
  includes = to_jsonb(array[
    'Marriage License',
    'Photographer for one hour',
    'Video for one hour',
    'A limousine',
    'The performance of the ceremony at a beach site or guest''s hotel'
  ]),
  sort_order = 3
where slug = 'hibiscus';

update public.wedding_packages set
  price_from_cents = 256000,
  tagline = 'The full island day',
  includes = to_jsonb(array[
    'Marriage License',
    'Photographer for one hour',
    'Video for one hour',
    'Limousine service',
    'The ceremony performed',
    'Single tier cake for Bride & Groom',
    'Bahamian gift'
  ]),
  sort_order = 4
where slug = 'poinciana';

update public.wedding_packages set
  price_from_cents = 280000,
  tagline = 'Everything planned for you',
  includes = to_jsonb(array[
    'Marriage License',
    'Photographer for two hours',
    'Video for one hour',
    'Limousine service',
    'The ceremony performed',
    'Wedding Cake (single tier)',
    'Gift'
  ]),
  sort_order = 5,
  visibility = 'live'
where slug = 'bronze';
