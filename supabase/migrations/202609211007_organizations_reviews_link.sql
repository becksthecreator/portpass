-- ProofBlock can render its reviews stat as a link to a business's real
-- third-party review listing (WeddingWire, Google, TripAdvisor, ...)
-- instead of asserting an unverifiable count -- see round 3's fix. That
-- was wired up as a hardcoded local constant on the BWS listing page;
-- making it two columns here means OrganizationTemplate can do the same
-- for every business rendered through it, BWS included, with no code
-- change for the next business that has one.
alter table public.organizations add column if not exists reviews_url text;
alter table public.organizations add column if not exists reviews_platform text;

update public.organizations set
  reviews_url = 'https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html',
  reviews_platform = 'WeddingWire'
where slug = 'bahamas-weddings';
